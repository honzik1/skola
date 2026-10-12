# Násobilka Settings, Difficulty, Timer, and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the math quiz into `nasobilka/`, limit easy examples, measure test duration, and persist/display the last 20 completed tests.

**Architecture:** Keep the current single-page application in `nasobilka/index.html`. Extend the existing pure `MathQuiz` generator API with difficulty classification and selection, and keep UI state, timer, settings persistence, and history rendering in the page controller. Use separate `localStorage` keys for settings and completed-test history, with defensive parsing/writes.

**Tech Stack:** HTML, CSS, browser JavaScript, browser `localStorage`, Node.js built-in `node:test`, `node:vm`, and `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-10-12-nasobilka-settings-history-design.md`

## Global Constraints

- Project files live under `nasobilka/`; do not leave a second application copy at the repository root.
- The multiplication table selector contains `0–10`.
- Multiplication uses a second factor in `0–10`; division continues to avoid division by zero.
- If table `0`, `1`, or `2` is selected, the 5% easy-example restriction is disabled.
- Otherwise, easy examples containing `0`, `1`, or `2` are limited to `floor(requestedCount * 0.05)`.
- Questions remain unique; if the hard pool cannot satisfy the request under the limit, return the available shorter test.
- Settings use `mathQuizSettings`; completed tests use `mathQuizHistory`.
- History is capped at 20 records, newest first, and storage failures must not break the app.
- A completed record is written once per test and includes `completedAt`, `description`, `incorrectCount`, and `durationMs`.
- Run `node --test` from `nasobilka/` before completion.

## Review Focus

- A selected table `0`, `1`, or `2` must bypass the 5% limit even when other tables are selected; test the exact bypass.
- A test using only table `3` must not silently fill a requested 20 questions with easy examples when the hard pool is too small; test the shorter unique result and warning-compatible length.
- Invalid JSON, invalid history entries, and unavailable storage must leave the page usable; test each defensive path.
- Re-entering the results screen must not duplicate a completed history record; test single-write behavior.
- A test completed in under one minute and one spanning multiple minutes must format as `X min YY s`; test both boundaries.

---

### Task 1: Move the application into `nasobilka/`

**Files:**
- Create: `nasobilka/index.html` (move the existing root application here)
- Create: `nasobilka/test/math-quiz.test.js` (move the existing test here)
- Delete: root `index.html` and root `test/math-quiz.test.js` after the move

**Interfaces:**
- Preserves all existing `window.MathQuiz.generateQuestions` and `window.MathQuiz.gradeAnswer` behavior.
- The test remains relative to `path.join(__dirname, '..', 'index.html')` after the move.

- [ ] **Step 1: Move the files without changing behavior**

```bash
mkdir -p nasobilka/test
mv index.html nasobilka/index.html
mv test/math-quiz.test.js nasobilka/test/math-quiz.test.js
rmdir test
```

- [ ] **Step 2: Run the existing tests from the new directory**

Run: `cd nasobilka && node --test`
Expected: all existing tests pass.

- [ ] **Step 3: Commit the relocation**

```bash
git add nasobilka index.html test
git commit -m "refactor: move quiz into nasobilka directory"
```

---

### Task 2: Add easy-example selection and the `0–10` table UI

**Files:**
- Modify: `nasobilka/index.html` (number selector, generator, and controller payload)
- Modify: `nasobilka/test/math-quiz.test.js` (generator tests)

**Interfaces:**
- `MathQuiz.generateQuestions({ operations, selectedNumbers, count, random, easyLimit }) -> Question[]` remains the public generator entry point; `easyLimit` is optional and defaults to the computed 5% rule.
- A question retains `{ text, answer, operation, key }`; add no UI-only state to question objects.
- Add pure helpers inside the exposed quiz module: `isEasyQuestion(question)` and `selectQuestions(pool, count, options)` or equivalent names with the same behavior.

- [ ] **Step 1: Write failing tests**

Add tests covering:

- selected table `3` generates multiplication candidates from `3 × 0` through `3 × 10`;
- when selected tables exclude `0`, `1`, and `2`, a requested count of 20 includes no more than `floor(20 * 0.05) === 1` easy question;
- selecting table `2` disables the restriction and permits the full easy pool;
- selected tables `[3]` with insufficient hard candidates return only unique available questions rather than exceeding the limit;
- division questions with a zero dividend are classified easy, while division by zero is never generated.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd nasobilka && node --test test/math-quiz.test.js`
Expected: the new difficulty tests fail because the current pool has no zero second factor and no 5% selection.

- [ ] **Step 3: Implement the generator behavior**

In `nasobilka/index.html`:

- add `TABLE_NUMBERS = [0, ..., 10]` and use selected table values from this range;
- generate multiplication with right factors `0–10`;
- keep division dividends `0–10` and divisors `1–10`;
- classify multiplication as easy when either factor is `0`, `1`, or `2`;
- classify division as easy when dividend or divisor is `0`, `1`, or `2`;
- bypass easy filtering when `selectedNumbers` contains `0`, `1`, or `2`;
- otherwise select at most `Math.floor(count * 0.05)` easy questions, fill the remainder from hard questions, preserve uniqueness, and return the available shorter list if hard questions run out;
- shuffle the final selected list.

- [ ] **Step 4: Update the settings UI and controller**

Replace the number selector with checkboxes `0–10`, update the helper text/range to `0–10`, collect the selected `0` value, and pass it to `generateQuestions`. Keep the no-selection validation and the existing notice for a shorter generated test.

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `cd nasobilka && node --test test/math-quiz.test.js`
Expected: all generator and existing behavior tests pass.

- [ ] **Step 6: Commit the difficulty change**

```bash
git add nasobilka/index.html nasobilka/test/math-quiz.test.js
git commit -m "feat: limit easy multiplication questions"
```

---

### Task 3: Add duration measurement and result display

**Files:**
- Modify: `nasobilka/index.html` (result markup and controller state)
- Modify: `nasobilka/test/math-quiz.test.js` (duration helper/controller tests)

**Interfaces:**
- Add a pure `formatDuration(durationMs) -> string` helper returning `X min YY s`.
- State owns `startedAt`, `completedAt`, and `durationMs`; these are reset for every newly started test.
- A valid, non-empty test sets `startedAt` immediately before showing the quiz.
- `showResults()` records completion only on the first completion and renders the stored `durationMs`.

- [ ] **Step 1: Write failing tests**

Add tests for `formatDuration(0) === '0 min 00 s'`, `formatDuration(8_000) === '0 min 08 s'`, and `formatDuration(127_000) === '2 min 07 s'`. Add an app test that starts a test with a controlled clock, completes it, and verifies the result duration is calculated from start to completion.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd nasobilka && node --test test/math-quiz.test.js`
Expected: duration helper/export and result duration assertions fail.

- [ ] **Step 3: Implement timing and display**

Add the duration helper to the exposed `MathQuiz` API, add a time item to the results markup, initialize timer fields when starting a valid test, compute elapsed milliseconds once when the final question is completed, and render the formatted duration.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `cd nasobilka && node --test test/math-quiz.test.js`
Expected: all duration and existing tests pass.

- [ ] **Step 5: Commit the timer change**

```bash
git add nasobilka/index.html nasobilka/test/math-quiz.test.js
git commit -m "feat: measure quiz completion time"
```

---

### Task 4: Persist completed tests and render the last 20

**Files:**
- Modify: `nasobilka/index.html` (history markup, storage helpers, and rendering)
- Modify: `nasobilka/test/math-quiz.test.js` (history tests and storage failure tests)

**Interfaces:**
- Use `HISTORY_STORAGE_KEY = 'mathQuizHistory'`.
- `buildTestDescription({ operations, selectedNumbers, questionCount }) -> string` returns the persisted human-readable description.
- `loadHistory() -> HistoryRecord[]` returns only valid records, newest first, capped at 20.
- `saveCompletedTest(record) -> void` prepends a record and caps storage at 20; storage exceptions are swallowed.
- `renderHistory(records) -> void` updates the settings-page table and empty state.
- A record has `{ completedAt, description, incorrectCount, durationMs }`.

- [ ] **Step 1: Write failing tests**

Add tests for:

- description containing selected operations, selected numbers, and requested count;
- saving a completed record and prepending it to existing history;
- capping 21 records to the newest 20;
- ignoring malformed JSON and invalid record shapes;
- tolerating `getItem`/`setItem` exceptions;
- writing exactly one record when results are shown more than once;
- rendering an empty-state message and a populated table in newest-first order.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd nasobilka && node --test test/math-quiz.test.js`
Expected: history helpers, table elements, and persistence assertions fail because no history exists.

- [ ] **Step 3: Implement history persistence**

Add the history table below the settings form with columns for completion date/time, test description, errors, and test duration. Implement defensive JSON parsing/validation, localized `cs-CZ` date formatting, duration formatting reuse, prepend-and-cap storage, empty state, and rendering after initialization.

At the first completion of a test, create the record from the selected settings and current result state, persist it once, and refresh the table without reloading. Do not persist history on invalid or abandoned tests.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `cd nasobilka && node --test test/math-quiz.test.js`
Expected: all history, storage failure, and previous feature tests pass.

- [ ] **Step 5: Commit the history change**

```bash
git add nasobilka/index.html nasobilka/test/math-quiz.test.js
git commit -m "feat: save and display quiz history"
```

---

### Task 5: Full verification and final review

**Files:**
- Modify: `nasobilka/index.html` only if verification reveals a defect
- Modify: `nasobilka/test/math-quiz.test.js` only if a missing regression test is identified

- [ ] **Step 1: Run the full test suite from the project directory**

Run: `cd nasobilka && node --test`
Expected: zero failures.

- [ ] **Step 2: Check repository layout and whitespace**

Run: `find . -maxdepth 3 -type f -not -path './.git/*' -print | sort && git diff --check`
Expected: application and tests exist under `nasobilka/`, no root duplicate remains, and no whitespace errors are reported.

- [ ] **Step 3: Manually review the user-visible flows**

Verify in a browser that:

- settings survive a reload;
- selecting table `0`, `1`, or `2` bypasses the easy-question limit;
- other selections visibly support zero examples but cap them at 5% when possible;
- the timer appears on the result screen;
- completing a test inserts one history row and reload preserves it;
- the history shows no more than 20 rows and remains keyboard accessible.

- [ ] **Step 4: Commit any final verification-only fixes**

```bash
git add nasobilka/index.html nasobilka/test/math-quiz.test.js
git commit -m "test: verify nasobilka history flow"
```
