import type { FileAsset, QuestionAsset, QuestionContentBlock, QuestionOption } from "@aios/api-sdk";

export interface QuestionAssetDraft extends QuestionAsset {
  draft_id: string;
}

export interface QuestionContentDraft {
  text: string;
  assets: QuestionAssetDraft[];
}

export interface QuestionOptionDraft {
  draft_id: string;
  text: string;
  assets: QuestionAssetDraft[];
}

let nextOptionDraftID = 0;
let nextAssetDraftID = 0;

export function createContentDraft(text = "", assets: QuestionAssetDraft[] = []): QuestionContentDraft {
  return {
    text,
    assets
  };
}

export function createOptionDraft(text = "", assets: QuestionAssetDraft[] = []): QuestionOptionDraft {
  nextOptionDraftID += 1;
  return {
    draft_id: `option_${nextOptionDraftID}`,
    text,
    assets
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
    content_type: getContentType(option),
    text: option.text,
    assets: option.assets.map(toQuestionAsset)
  }));
}

export function buildQuestionContentBlock(draft: QuestionContentDraft): QuestionContentBlock {
  return {
    content_type: getContentType(draft),
    text: draft.text,
    assets: draft.assets.map(toQuestionAsset)
  };
}

export function createAssetDraftFromFileAsset(asset: FileAsset): QuestionAssetDraft {
  nextAssetDraftID += 1;
  return {
    draft_id: `asset_${nextAssetDraftID}`,
    url: asset.url ?? asset.original_url ?? "",
    type: asset.mime_type?.startsWith("image/") ? "image" : "file",
    file_asset_id: asset.id,
    filename: asset.original_filename ?? undefined,
    mime_type: asset.mime_type ?? undefined
  };
}

export function createAssetDraftFromURL(url: string, type = "image"): QuestionAssetDraft {
  nextAssetDraftID += 1;
  return {
    draft_id: `asset_${nextAssetDraftID}`,
    url,
    type
  };
}

export function hasContentDraftValue(draft: QuestionContentDraft): boolean {
  return draft.text.trim() !== "" || draft.assets.some((asset) => asset.url.trim() !== "");
}

export function hasOptionDraftValue(option: QuestionOptionDraft): boolean {
  return option.text.trim() !== "" || option.assets.some((asset) => asset.url.trim() !== "");
}

export function createContentDraftFromBlock(block?: { text?: string | null; assets?: QuestionAsset[] | null }): QuestionContentDraft {
  return createContentDraft(block?.text ?? "", createAssetDraftsFromAssets(block?.assets ?? []));
}

export function createOptionDraftFromOption(option?: { text?: string | null; assets?: QuestionAsset[] | null }): QuestionOptionDraft {
  return createOptionDraft(option?.text ?? "", createAssetDraftsFromAssets(option?.assets ?? []));
}

function createAssetDraftsFromAssets(assets: QuestionAsset[]): QuestionAssetDraft[] {
  return assets
    .filter((asset) => typeof asset.url === "string" && asset.url.trim() !== "")
    .map((asset) => createAssetDraftFromQuestionAsset(asset));
}

function createAssetDraftFromQuestionAsset(asset: QuestionAsset): QuestionAssetDraft {
  nextAssetDraftID += 1;
  return {
    ...asset,
    draft_id: `asset_${nextAssetDraftID}`,
    type: asset.type || "image"
  };
}

function getContentType(draft: QuestionContentDraft): string {
  const hasText = draft.text.trim() !== "";
  const hasAssets = draft.assets.some((asset) => asset.url.trim() !== "");
  if (hasText && hasAssets) {
    return "mixed";
  }
  if (hasAssets) {
    return "image";
  }
  return "text";
}

function toQuestionAsset(asset: QuestionAssetDraft): QuestionAsset {
  return {
    url: asset.url,
    type: asset.type,
    file_asset_id: asset.file_asset_id,
    filename: asset.filename,
    mime_type: asset.mime_type
  };
}
