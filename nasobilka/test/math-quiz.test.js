const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadMathQuiz() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  const context = { window: {} };
  vm.runInNewContext(script, context);
  return context.window.MathQuiz;
}

const SETTINGS_STORAGE_KEY = 'mathQuizSettings';

const HISTORY_STORAGE_KEY = 'mathQuizHistory';

class FakeStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
    this.setItemCalls = [];
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.setItemCalls.push(key);
    this.values.set(key, String(value));
  }
}

function createControlledDate(clock) {
  const NativeDate = Date;
  function ControlledDate(...args) {
    if (new.target) {
      return args.length === 0 ? new NativeDate(clock.value) : new NativeDate(...args);
    }
    return NativeDate(...args);
  }
  ControlledDate.now = () => clock.value;
  ControlledDate.parse = NativeDate.parse;
  ControlledDate.UTC = NativeDate.UTC;
  ControlledDate.prototype = NativeDate.prototype;
  return ControlledDate;
}

class FakeElement {
  constructor(document) {
    this.ownerDocument = document;
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.children = [];
    this._innerHTML = '';
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === '') {
      this.children = [];
    }
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  dispatchEvent(type, event = {}) {
    const listener = this.listeners[type];
    if (!listener) {
      return;
    }

    listener({
      preventDefault() {},
      ...event,
    });
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute() {}
}

function loadQuizApp(storage = new FakeStorage(), clock = { value: 0 }) {
  const document = { activeElement: null };
  const selectors = [
    '#settings-form',
    '#history-table',
    '#history-empty',
    '#history-body',
    '#settings-screen',
    '#quiz-screen',
    '#results-screen',
    '#settings-message',
    '#quiz-notice',
    '#progress-label',
    '#progress-bar',
    '#question-expression',
    '#answer-form',
    '#answer-input',
    '#check-button',
    '#feedback',
    '#next-button',
    '#results-title',
    '#correct-count',
    '#incorrect-count',
    '#total-count',
    '#score-percentage',
    '#duration',
    '#new-quiz-button',
    '#question-count',
  ];
  const elements = Object.fromEntries(
    selectors.map((selector) => [selector, new FakeElement(document)]),
  );
  const operationInputs = [
    { value: 'multiplication', checked: true },
    { value: 'division', checked: false },
  ];
  const tableInputs = Array.from({ length: 11 }, (_, index) => ({
    value: String(index),
    checked: true,
  }));
  const settingsForm = elements['#settings-form'];
  settingsForm.querySelectorAll = (selector) => {
    if (selector.includes('operation')) {
      return selector.includes(':checked')
        ? operationInputs.filter((input) => input.checked)
        : operationInputs;
    }
    if (selector.includes('table-number')) {
      return selector.includes(':checked')
        ? tableInputs.filter((input) => input.checked)
        : tableInputs;
    }
    return [];
  };
  document.querySelector = (selector) => elements[selector];
  document.createElement = () => new FakeElement(document);

  const window = {
    localStorage: storage,
    setTimeout(callback) {
      callback();
    },
  };
  const context = {
    window,
    document,
    Date: createControlledDate(clock),
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
      .match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1],
    context,
  );

  return {
    document,
    settingsForm,
    questionCount: elements['#question-count'],
    resultsScreen: elements['#results-screen'],
    questionExpression: elements['#question-expression'],
    answerForm: elements['#answer-form'],
    answerInput: elements['#answer-input'],
    nextButton: elements['#next-button'],
    duration: elements['#duration'],
    historyTable: elements['#history-table'],
    historyEmpty: elements['#history-empty'],
    historyBody: elements['#history-body'],
    operationInputs,
    tableInputs,
  };
}

test('keeps the browser script compatible with older Safari parsers', () => {
  const htmlPaths = [
    path.join(__dirname, '..', 'index.html'),
    path.join(__dirname, '..', '..', 'index.html'),
  ];

  htmlPaths.forEach((htmlPath) => {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
    assert.doesNotMatch(script, /\?\?/);
  });
});

test('formats durations as minutes and zero-padded seconds', () => {
  const mathQuiz = loadMathQuiz();

  assert.equal(mathQuiz.formatDuration(0), '0 min 00 s');
  assert.equal(mathQuiz.formatDuration(8_000), '0 min 08 s');
  assert.equal(mathQuiz.formatDuration(127_000), '2 min 07 s');
});

test('generates the selected multiplication table from 0 to 10', () => {
  const mathQuiz = loadMathQuiz();
  const questions = mathQuiz.generateQuestions({
    operations: ['multiplication'],
    selectedNumbers: [2],
    count: 100,
    random: () => 0.5,
  });

  assert.equal(questions.length, 11);
  assert.deepEqual(
    new Set(questions.map((question) => question.text)),
    new Set(Array.from({ length: 11 }, (_, index) => `2 × ${index}`)),
  );
});

test('combines multiple selected multiplication tables without duplicates', () => {
  const mathQuiz = loadMathQuiz();
  const questions = mathQuiz.generateQuestions({
    operations: ['multiplication'],
    selectedNumbers: [2, 5],
    count: 100,
    random: () => 0.5,
  });

  assert.equal(questions.length, 22);
  assert.equal(new Set(questions.map((question) => question.key)).size, 22);
  assert.ok(questions.every((question) => /^(2|5) × (?:[0-9]|10)$/.test(question.text)));
});

test('generates the complete selected table when the easy limit is explicitly raised', () => {
  const mathQuiz = loadMathQuiz();
  const questions = mathQuiz.generateQuestions({
    operations: ['multiplication'],
    selectedNumbers: [3],
    count: 100,
    easyLimit: 100,
    random: () => 0.5,
  });

  assert.equal(questions.length, 11);
  assert.deepEqual(
    new Set(questions.map((question) => question.text)),
    new Set(Array.from({ length: 11 }, (_, index) => `3 × ${index}`)),
  );
});

test('limits easy examples to five percent when easy tables are not selected', () => {
  const mathQuiz = loadMathQuiz();
  const questions = mathQuiz.generateQuestions({
    operations: ['multiplication'],
    selectedNumbers: [3, 4, 5],
    count: 20,
    random: () => 0.5,
  });

  assert.ok(questions.filter((question) => mathQuiz.isEasyQuestion(question)).length <= 1);
});

test('does not limit easy examples when table two is selected', () => {
  const mathQuiz = loadMathQuiz();
  const questions = mathQuiz.generateQuestions({
    operations: ['multiplication'],
    selectedNumbers: [2, 3],
    count: 100,
    random: () => 0.5,
  });

  assert.equal(questions.length, 22);
  assert.equal(questions.filter((question) => mathQuiz.isEasyQuestion(question)).length, 14);
});

test('shuffles unrestricted candidates before truncating the test', () => {
  const mathQuiz = loadMathQuiz();
  const questions = mathQuiz.generateQuestions({
    operations: ['multiplication'],
    selectedNumbers: [2],
    count: 1,
    random: () => 0,
  });

  assert.equal(questions[0].text, '2 × 1');
});

test('returns only available hard questions when the easy limit cannot fill the request', () => {
  const mathQuiz = loadMathQuiz();
  const questions = mathQuiz.generateQuestions({
    operations: ['multiplication'],
    selectedNumbers: [3],
    count: 20,
    random: () => 0.5,
  });

  assert.equal(questions.length, 9);
  assert.equal(new Set(questions.map((question) => question.key)).size, 9);
  assert.ok(questions.filter((question) => mathQuiz.isEasyQuestion(question)).length <= 1);
});

test('classifies zero dividends as easy and never generates division by zero', () => {
  const mathQuiz = loadMathQuiz();
  const questions = mathQuiz.generateQuestions({
    operations: ['division'],
    selectedNumbers: [3],
    count: 100,
    easyLimit: 100,
    random: () => 0.5,
  });

  assert.ok(questions.some((question) => question.text.startsWith('0 :')));
  assert.ok(questions.filter((question) => mathQuiz.isEasyQuestion(question)).length > 0);
  assert.ok(questions.every((question) => !question.text.endsWith(': 0')));
});

test('measures the test from start until the final answer', () => {
  const clock = { value: 0 };
  const app = loadQuizApp(new FakeStorage(), clock);
  app.questionCount.value = '1';
  app.settingsForm.dispatchEvent('submit');

  const [left, right] = app.questionExpression.textContent.split(' × ').map(Number);
  app.answerInput.value = String(left * right);
  clock.value = 127_000;
  app.answerForm.dispatchEvent('submit');
  app.nextButton.dispatchEvent('click');

  assert.equal(app.duration.textContent, '2 min 07 s');
  assert.equal(app.document.activeElement, app.resultsScreen);
});

test('moves focus to the next question button after checking an answer', () => {
  const app = loadQuizApp();
  app.questionCount.value = '1';
  app.settingsForm.dispatchEvent('submit');

  const [left, right] = app.questionExpression.textContent.split(' × ').map(Number);
  app.answerInput.value = String(left * right);
  app.answerForm.dispatchEvent('submit');

  assert.equal(app.nextButton.hidden, false);
  assert.equal(app.document.activeElement, app.nextButton);
});

test('restores the last test settings from localStorage', () => {
  const storage = new FakeStorage({
    [SETTINGS_STORAGE_KEY]: JSON.stringify({
      operations: ['division'],
      selectedNumbers: [0, 3, 7],
      questionCount: 12,
    }),
  });
  const app = loadQuizApp(storage);

  assert.deepEqual(
    app.operationInputs.map(({ value, checked }) => ({ value, checked })),
    [
      { value: 'multiplication', checked: false },
      { value: 'division', checked: true },
    ],
  );
  assert.deepEqual(
    app.tableInputs.filter((input) => input.checked).map((input) => Number(input.value)),
    [0, 3, 7],
  );
  assert.equal(app.questionCount.value, '12');
});

test('saves the current test settings when they change', () => {
  const storage = new FakeStorage();
  const app = loadQuizApp(storage);
  app.operationInputs[0].checked = false;
  app.operationInputs[1].checked = true;
  app.tableInputs.forEach((input) => {
    input.checked = ['2', '5'].includes(input.value);
  });
  app.questionCount.value = '15';
  app.settingsForm.dispatchEvent('change');
  app.questionCount.dispatchEvent('input');

  assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)), {
    operations: ['division'],
    selectedNumbers: [2, 5],
    questionCount: 15,
  });
});

test('stores a completed test with its description, errors, and duration', () => {
  const storage = new FakeStorage();
  const clock = { value: 1_000 };
  const app = loadQuizApp(storage, clock);
  app.tableInputs.forEach((input) => {
    input.checked = ['3', '5'].includes(input.value);
  });
  app.questionCount.value = '1';
  app.settingsForm.dispatchEvent('submit');

  const [left, right] = app.questionExpression.textContent.split(' × ').map(Number);
  app.answerInput.value = String(left * right);
  clock.value = 6_000;
  app.answerForm.dispatchEvent('submit');
  app.nextButton.dispatchEvent('click');

  const records = JSON.parse(storage.getItem(HISTORY_STORAGE_KEY));
  assert.equal(records.length, 1);
  assert.match(records[0].description, /Násobení/);
  assert.match(records[0].description, /3, 5/);
  assert.match(records[0].description, /1 příklad/);
  assert.equal(records[0].incorrectCount, 0);
  assert.equal(records[0].durationMs, 5_000);
});

test('prepends completed tests and keeps only the newest twenty records', () => {
  const oldRecords = Array.from({ length: 20 }, (_, index) => ({
    completedAt: new Date(index + 1).toISOString(),
    description: `Starší test ${index + 1}`,
    incorrectCount: index,
    durationMs: index * 1_000,
  }));
  const storage = new FakeStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(oldRecords) });
  const clock = { value: 30_000 };
  const app = loadQuizApp(storage, clock);
  app.questionCount.value = '1';
  app.settingsForm.dispatchEvent('submit');
  const [left, right] = app.questionExpression.textContent.split(' × ').map(Number);
  app.answerInput.value = String(left * right);
  app.nextButton.dispatchEvent('submit');
  app.answerForm.dispatchEvent('submit');
  app.nextButton.dispatchEvent('click');

  const records = JSON.parse(storage.getItem(HISTORY_STORAGE_KEY));
  assert.equal(records.length, 20);
  assert.match(records[0].description, /Násobení/);
  assert.equal(records.at(-1).description, 'Starší test 2');
});

test('ignores malformed history data and invalid records', () => {
  const storage = new FakeStorage({
    [HISTORY_STORAGE_KEY]: JSON.stringify([
      { completedAt: 'not-a-date', description: 'Špatný záznam', incorrectCount: 0, durationMs: 1000 },
      { completedAt: new Date(1).toISOString(), description: 'Platný záznam', incorrectCount: 1, durationMs: 1000 },
      { description: 'Chybí datum' },
    ]),
  });
  const app = loadQuizApp(storage);

  assert.equal(app.historyBody.children.length, 1);
  assert.match(app.historyBody.children[0].children[1].textContent, /Platný záznam/);
});

test('renders history newest first and shows an empty state when needed', () => {
  const storage = new FakeStorage({
    [HISTORY_STORAGE_KEY]: JSON.stringify([
      { completedAt: new Date(2).toISOString(), description: 'Novější', incorrectCount: 0, durationMs: 2000 },
      { completedAt: new Date(1).toISOString(), description: 'Starší', incorrectCount: 2, durationMs: 1000 },
    ]),
  });
  const app = loadQuizApp(storage);

  assert.equal(app.historyEmpty.hidden, true);
  assert.equal(app.historyTable.hidden, false);
  assert.equal(app.historyBody.children.length, 2);
  assert.equal(app.historyBody.children[0].children[1].textContent, 'Novější');
  assert.equal(app.historyBody.children[1].children[1].textContent, 'Starší');

  const emptyApp = loadQuizApp(new FakeStorage());
  assert.equal(emptyApp.historyEmpty.hidden, false);
  assert.equal(emptyApp.historyTable.hidden, true);
});

test('handles unavailable localStorage without breaking the app', () => {
  const unavailableStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };

  assert.doesNotThrow(() => loadQuizApp(unavailableStorage));
});

test('writes a completed result only once when results are shown repeatedly', () => {
  const storage = new FakeStorage();
  const app = loadQuizApp(storage);
  app.questionCount.value = '1';
  app.settingsForm.dispatchEvent('submit');
  const [left, right] = app.questionExpression.textContent.split(' × ').map(Number);
  app.answerInput.value = String(left * right);
  app.answerForm.dispatchEvent('submit');
  app.nextButton.dispatchEvent('click');
  app.nextButton.dispatchEvent('click');

  assert.equal(JSON.parse(storage.getItem(HISTORY_STORAGE_KEY)).length, 1);
});
