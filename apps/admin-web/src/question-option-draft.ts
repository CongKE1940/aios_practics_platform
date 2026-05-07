import type { QuestionOption } from "@aios/api-sdk";

export interface QuestionOptionDraft {
  draft_id: string;
  text: string;
}

let nextOptionDraftID = 0;

export function createOptionDraft(text = ""): QuestionOptionDraft {
  nextOptionDraftID += 1;
  return {
    draft_id: `option_${nextOptionDraftID}`,
    text
  };
}

export function createDefaultOptionDrafts(...texts: string[]): QuestionOptionDraft[] {
  const optionTexts = texts.length > 0 ? texts : ["", ""];
  return optionTexts.map((text) => createOptionDraft(text));
}

export function getOptionKey(index: number): string {
  let value = index + 1;
  let key = "";
  while (value > 0) {
    const offset = (value - 1) % 26;
    key = String.fromCharCode(65 + offset) + key;
    value = Math.floor((value - 1) / 26);
  }
  return key;
}

export function normalizeCorrectKey(correctKey: string, options: QuestionOptionDraft[]): string {
  const keys = options.map((_, index) => getOptionKey(index));
  const normalized = correctKey.trim().toUpperCase();
  return keys.includes(normalized) ? normalized : keys[0] ?? "A";
}

export function buildTextQuestionOptions(options: QuestionOptionDraft[]): QuestionOption[] {
  return options.map((option, index) => ({
    key: getOptionKey(index),
    content_type: "text",
    text: option.text,
    assets: []
  }));
}
