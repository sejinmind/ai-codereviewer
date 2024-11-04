import { readFileSync } from "fs";
import * as core from "@actions/core";
import OpenAI from "openai";
import { Octokit } from "@octokit/rest";
import parseDiff, { Chunk, File } from "parse-diff";
import minimatch from "minimatch";
import Anthropic from "@anthropic-ai/sdk";
import { TextBlock } from "@anthropic-ai/sdk/resources";

const GITHUB_TOKEN: string = core.getInput("GITHUB_TOKEN");
const OPENAI_API_KEY: string = core.getInput("OPENAI_API_KEY");
const OPENAI_API_MODEL: string = core.getInput("OPENAI_API_MODEL");
const ANTHROPIC_API_KEY: string = core.getInput("ANTHROPIC_API_KEY");
const MODEL_PROVIDER: string = core.getInput("MODEL_PROVIDER") || "openai"; // 기본값은 openai

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

interface PRDetails {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  description: string;
}

async function getPRDetails(): Promise<PRDetails> {
  const { repository, number } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8")
  );
  const prResponse = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
  });
  return {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
    title: prResponse.data.title ?? "",
    description: prResponse.data.body ?? "",
  };
}

async function getDiff(
  owner: string,
  repo: string,
  pull_number: number
): Promise<string | null> {
  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number,
    mediaType: { format: "diff" },
  });
  // @ts-expect-error - response.data is a string
  return response.data;
}

async function analyzeCode(
  parsedDiff: File[],
  prDetails: PRDetails
): Promise<Array<{ body: string; path: string; line: number }>> {
  const comments: Array<{ body: string; path: string; line: number }> = [];

  for (const file of parsedDiff) {
    if (file.to === "/dev/null") continue; // Ignore deleted files
    for (const chunk of file.chunks) {
      const prompt = createPrompt(file, chunk, prDetails);
      const aiResponse = await getAIResponse(prompt);
      if (aiResponse) {
        const newComments = createComment(file, chunk, aiResponse);
        if (newComments) {
          comments.push(...newComments);
        }
      }
    }
  }
  return comments;
}

function createPrompt(file: File, chunk: Chunk, prDetails: PRDetails): string {
  return `

  # Answer Role: Reviewer
당신은 개발팀을 이루는 팀장입니다. 팀원이 작성한 코드를 검토하는 역할을 수행합니다.

### Requirements, Reviewing Guide, Pull Request on GitHub
- 코드에 대한 긍정적인 댓글이나 칭찬을 포함하지 마세요.
- GitHub Markdown 형식을 사용하여 댓글을 작성하세요.
- 코드와 관련된 댓글만 포함하세요.
- **중요**: 코드에 주석 추가를 절대 제안하지 마세요.
- 리뷰잉의 근거를 명확하게 작성하세요. 공식홈페이지나 가이드 웹사이트가 있다면 첨부해주세요,

### Output Format
- 다음 JSON 형식으로 응답 메시지를 제공하세요: {"reviews": [{"lineNumber": "<line_number>", "reviewComment": "<review_comment>"}]}
- 코드에 댓글이 필요하지 않은 경우, "reviews"를 빈 배열로 두세요.
- <review_comment>이 출력 모드는 한글 모드입니다. 한글로 출력해 주세요.


### Pull Request Details
파일 "${file.to}"에서 다음 코드 차이를 검토하고, 응답을 작성할 때 pull request의 제목과 설명을 고려하세요.

Pull request title: ${prDetails.title}
Pull request description:
---
${prDetails.description}
---

Git diff to review:

\`\`\`diff
${chunk.content}
${chunk.changes
  // @ts-expect-error - ln and ln2 exists where needed
  .map((c) => `${c.ln ? c.ln : c.ln2} ${c.content}`)
  .join("\n")}
\`\`\`
`;
}

async function getAIResponse(prompt: string): Promise<Array<{
  lineNumber: string;
  reviewComment: string;
}> | null> {
  try {
    if (MODEL_PROVIDER === "anthropic") {
      const response = await anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        max_tokens: 3000,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });
      if (response.content.length === 0) {
        return [];
      }
      const textBlock = response.content[0] as TextBlock;
      const res = textBlock.text.trim() || '{}';
      const cleanedJsonString = res.replace(/```json|```/g, "");
      return JSON.parse(cleanedJsonString).reviews;
    } else {
      const queryConfig = {
        model: OPENAI_API_MODEL,
        temperature: 0.2,
        max_tokens: 3000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      };

      const response = await openai.chat.completions.create({
        ...queryConfig,
        ...(OPENAI_API_MODEL === "gpt-4-1106-preview"
          ? { response_format: { type: "json_object" } }
          : {}),
        messages: [
          {
            role: "system",
            content: prompt,
          },
        ],
      });
      if (response.choices.length === 0) {
        return [];
      }
      const res = response.choices[0].message?.content?.trim() || "{}";
      const cleanedJsonString = res.replace(/```json|```/g, "");
      return JSON.parse(cleanedJsonString).reviews;
    }
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

function createComment(
  file: File,
  chunk: Chunk,
  aiResponses: Array<{
    lineNumber: string;
    reviewComment: string;
  }>
): Array<{ body: string; path: string; line: number }> {
  return aiResponses.flatMap((aiResponse) => {
    if (!file.to) {
      return [];
    }
    if (!aiResponse.lineNumber || !aiResponse.reviewComment) {
      return [];
    }
    console.log(aiResponse);
    return {
      body: aiResponse.reviewComment,
      path: file.to,
      line: Number(aiResponse.lineNumber),
    };
  });
}

async function createReviewComments(
  owner: string,
  repo: string,
  pull_number: number,
  comments: Array<{ body: string; path: string; line: number }>
): Promise<void> {
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number,
    comments,
    event: "COMMENT",
  });
}

async function main() {
  const prDetails = await getPRDetails();
  let diff: string | null;
  const eventData = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")
  );

  if (eventData.action === "opened") {
    diff = await getDiff(
      prDetails.owner,
      prDetails.repo,
      prDetails.pull_number
    );
  } else if (eventData.action === "synchronize") {
    const newBaseSha = eventData.before;
    const newHeadSha = eventData.after;

    const response = await octokit.repos.compareCommits({
      headers: {
        accept: "application/vnd.github.v3.diff",
      },
      owner: prDetails.owner,
      repo: prDetails.repo,
      base: newBaseSha,
      head: newHeadSha,
    });

    diff = String(response.data);
  } else {
    console.log("Unsupported event:", process.env.GITHUB_EVENT_NAME);
    return;
  }

  if (!diff) {
    console.log("No diff found");
    return;
  }

  const parsedDiff = parseDiff(diff);

  const excludePatterns = core
    .getInput("exclude")
    .split(",")
    .map((s) => s.trim());

  const filteredDiff = parsedDiff.filter((file) => {
    return !excludePatterns.some((pattern) =>
      minimatch(file.to ?? "", pattern)
    );
  });

  const comments = await analyzeCode(filteredDiff, prDetails);
  if (comments.length > 0) {
    for (let i = 0; i < comments.length; i += 20) {
      const commentSlice = comments.slice(i, i + 20);
      // 동기적 for loop를 사용하여 20개씩 댓글을 작성합니다.
      await createReviewComments(
        prDetails.owner,
        prDetails.repo,
        prDetails.pull_number,
        commentSlice
      );
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
