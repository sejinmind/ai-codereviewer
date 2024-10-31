.PHONY: release

release:
	yarn build
	yarn package
	git add .
	git commit -m "release today $$(date +%Y%m%d_%H%M%S)"
	git push origin main