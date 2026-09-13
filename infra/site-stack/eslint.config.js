const js = require("@eslint/js");
const globals = require("globals");
const sonarjs = require("eslint-plugin-sonarjs");
const n = require("eslint-plugin-n");
const { buildBaseConfig } = require("../infra-shared/eslint.config.base.js");

module.exports = buildBaseConfig({
  js,
  globals,
  sonarjs,
  n,
  generatedConfigConsumers: ["functions/checkAuth.js"],
});
