.PHONY: build test publish

TESTS=$(shell cd test && ls *.coffee | sed s/\.coffee$$//)

build: underscore.deep.js

underscore.deep.js: underscore.deep.coffee
	node_modules/coffee-script/bin/coffee --bare -c underscore.deep.coffee

test: $(TESTS) README.coffee.md

README.coffee.md: build
	node_modules/mocha/bin/mocha --reporter spec --compilers coffee:coffee-script README.coffee.md

$(TESTS): build
	@echo $(LIBS)
	node_modules/mocha/bin/mocha --bail --timeout 60000 --compilers coffee:coffee-script test/$@.coffee

publish:
	$(eval VERSION := $(shell grep version package.json | sed -ne 's/^[ ]*"version":[ ]*"\([0-9\.]*\)",/\1/p';))
	@echo \'$(VERSION)\'
	$(eval REPLY := $(shell read -p "Publish and tag as $(VERSION)? " -n 1 -r; echo $$REPLY))
	@echo \'$(REPLY)\'
	@if [[ $(REPLY) =~ ^[Yy]$$ ]]; then \
	    npm publish; \
	    git tag -a v$(VERSION) -m "version $(VERSION)"; \
	    git push --tags; \
	fi
