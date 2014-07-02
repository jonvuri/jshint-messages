jshint-messages
===============

Generate documentation for jshint's error, warning, and info messages.

This utility requires a local copy of [jshint source](https://github.com/jshint/jshint). If it's in a sibling directory, do these steps in this directory:

```
npm install
node jshint-messages.js ../jshint
```

The documentation will be placed in directory "out" as Github-flavored Markdown (.md) files.
