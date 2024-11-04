# AI Code Reviewer

AI Code Reviewer는 OpenAI의 GPT-4 API 또는 Anthropic의 Claude API를 활용하여 풀 리퀘스트에 대한 지능형 피드백과 제안을 제공하는 GitHub Action입니다.

## Features

- OpenAI GPT-4 또는 Anthropic Claude를 사용한 코드 리뷰
- 코드 개선을 위한 지능형 코멘트 및 제안
- 지정된 패턴의 파일 제외 기능
- 간편한 설정 및 GitHub 워크플로우 통합

## Setup

1. API 키 준비:
   - OpenAI 사용 시: [OpenAI](https://beta.openai.com/signup)에서 API 키 발급
   - Anthropic 사용 시: [Anthropic](https://www.anthropic.com/)에서 API 키 발급

2. GitHub Secrets 설정:
   - OpenAI 사용 시: `OPENAI_API_KEY`
   - Anthropic 사용 시: `ANTHROPIC_API_KEY`

   [GitHub Secrets 설정 방법](https://docs.github.com/en/actions/reference/encrypted-secrets)

3. `.github/workflows/main.yml` 파일 생성:

```yaml
name: AI Code Reviewer

on:
  pull_request:
    types:
      - opened
      - synchronize
permissions: write-all
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v3

      - name: AI Code Reviewer
        uses: your-username/ai-codereviewer@main
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # OpenAI 설정
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          AI_MODEL: "gpt-4" # 선택사항: 기본값 "gpt-4"
          # Anthropic 설정
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          MODEL_PROVIDER: "openai" # 선택사항: "openai" 또는 "anthropic", 기본값 "openai"
          # 토큰 제한 설정
          MAX_OUTPUT_TOKENS: 4096 # 선택사항: AI 응답의 최대 토큰 수
          MAX_CONTEXT_TOKENS: 16384 # 선택사항: 입력 컨텍스트의 최대 토큰 수
          # 파일 제외 패턴
          exclude: "**/*.json, **/*.md" # 선택사항: 콤마로 구분된 제외 패턴
```

4. `your-username`을 AI Code Reviewer 저장소가 위치한 GitHub 사용자명이나 조직명으로 변경하세요.

## Configuration

| 입력 변수 | 필수 여부 | 기본값 | 설명 |
|------------|----------|---------|-------------|
| GITHUB_TOKEN | 필수 | - | GitHub API 접근용 토큰 |
| OPENAI_API_KEY | 선택 | - | OpenAI API 키 |
| AI_MODEL | 선택 | gpt-4 | 사용할 OpenAI 모델 |
| ANTHROPIC_API_KEY | 선택 | - | Anthropic API 키 |
| MODEL_PROVIDER | 선택 | openai | 사용할 AI 제공자 ("openai" 또는 "anthropic") |
| MAX_OUTPUT_TOKENS | 선택 | 4096 | AI 응답의 최대 토큰 수 |
| MAX_CONTEXT_TOKENS | 선택 | 16384 | 입력 컨텍스트의 최대 토큰 수 |
| exclude | 선택 | - | 리뷰에서 제외할 파일 패턴 |

## How It Works

AI Code Reviewer는 PR의 diff를 가져와 제외된 파일을 필터링한 후, 코드 청크를 선택된 AI 제공자(OpenAI 또는 Anthropic)에게 전송합니다. AI의 응답을 기반으로 리뷰 코멘트를 생성하여 PR에 추가합니다.

## Contributing

기여는 언제나 환영합니다! 이슈나 PR을 통해 AI Code Reviewer를 개선하는데 참여해주세요.

패키지 생성은 메인테이너가 수행합니다 (`yarn build` & `yarn package`).

## License

이 프로젝트는 MIT 라이선스를 따릅니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.
