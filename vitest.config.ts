import { defineConfig } from "vitest/config";

// Pins which files `npm test` runs.
//
// Without this, vitest's default glob walks the whole working tree, so any
// scratch checkout that happens to sit inside the repo joins the suite: a
// leftover agent worktree under .claude/worktrees/ once doubled the reported
// count (220 "passing" tests where the repository only has 111), and those
// extra tests were exercising a different copy of src/ entirely. A green run
// that includes files outside the repository is not evidence about the
// repository, and the inflated number hides that. vitest does not read
// .gitignore, so ignoring the directory in git is not enough.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
