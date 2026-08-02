"use strict";

// 複数家族対応(examination#44)が実装されるまでは固定値として扱う。
// lineWebhook.js・interviewQuestions.jsなど、familySlugを参照する複数のLambdaで共有する
const FAMILY_SLUG = "chofu-suzuki";

module.exports = { FAMILY_SLUG };
