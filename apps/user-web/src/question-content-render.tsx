import type { CSSProperties } from "react";

import type { QuestionAsset } from "@aios/api-sdk";

export interface RenderableContentBlock {
  text?: unknown;
  assets?: unknown;
}

export interface RenderableOption extends RenderableContentBlock {
  key: string;
}

export function QuestionContentBlockView({
  block,
  fallback = "",
  compact = false
}: {
  block?: RenderableContentBlock;
  fallback?: string;
  compact?: boolean;
}) {
  const text = extractBlockText(block);
  const assets = extractBlockAssets(block);
  if (!text && assets.length === 0) {
    return fallback ? <p style={compact ? compactTextStyle : undefined}>{fallback}</p> : null;
  }
  return (
    <div style={compact ? compactBlockStyle : blockStyle}>
      {text ? <p style={compact ? compactTextStyle : textStyle}>{text}</p> : null}
      {assets.length > 0 ? (
        <div style={assetGridStyle}>
          {assets.map((asset, index) =>
            asset.type === "image" ? (
              <img key={`${asset.url}_${index}`} src={asset.url} alt="" style={compact ? compactImageStyle : imageStyle} />
            ) : (
              <a key={`${asset.url}_${index}`} href={asset.url} target="_blank" rel="noreferrer">
                {asset.filename || "查看附件"}
              </a>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

export function LabeledQuestionContentBlockView({
  label,
  block,
  fallback = "-",
  compact = false
}: {
  label: string;
  block?: RenderableContentBlock;
  fallback?: string;
  compact?: boolean;
}) {
  const text = extractBlockText(block);
  const assets = extractBlockAssets(block);
  if (!text && assets.length === 0) {
    return (
      <p style={compact ? compactTextStyle : undefined}>
        {label}：{fallback}
      </p>
    );
  }
  if (assets.length === 0) {
    return (
      <p style={compact ? compactTextStyle : undefined}>
        {label}：{text}
      </p>
    );
  }
  return (
    <div style={compact ? compactBlockStyle : blockStyle}>
      <p style={compact ? compactTextStyle : textStyle}>{label}：</p>
      <QuestionContentBlockView block={block} compact={compact} />
    </div>
  );
}

export function QuestionOptionBody({ option }: { option: RenderableOption }) {
  return <QuestionContentBlockView block={option} fallback="-" compact />;
}

export function getStemBlock(content: unknown): RenderableContentBlock | undefined {
  if (!isRecord(content)) {
    return undefined;
  }
  if (isRecord(content.stem)) {
    return content.stem;
  }
  return typeof content.stem === "string" ? { text: content.stem } : undefined;
}

export function getOptionGroupBlock(content: unknown): RenderableContentBlock | undefined {
  if (!isRecord(content)) {
    return undefined;
  }
  if (isRecord(content.option_group)) {
    return content.option_group;
  }
  return typeof content.option_group === "string" ? { text: content.option_group } : undefined;
}

export function extractQuestionText(content: unknown): string {
  return extractBlockText(getStemBlock(content));
}

export function extractQuestionOptions(content: unknown, questionType?: string): RenderableOption[] {
  if (isRecord(content) && Array.isArray(content.options) && content.options.length > 0) {
    return content.options
      .filter(isRecord)
      .map((option) => ({
        key: typeof option.key === "string" ? option.key : "",
        text: option.text,
        assets: option.assets
      }));
  }
  if (questionType === "true_false") {
    return [
      { key: "true", text: "正确", assets: [] },
      { key: "false", text: "错误", assets: [] }
    ];
  }
  return [];
}

export function extractBlockText(block?: RenderableContentBlock): string {
  return typeof block?.text === "string" ? block.text.trim() : "";
}

function extractBlockAssets(block?: RenderableContentBlock): QuestionAsset[] {
  if (!Array.isArray(block?.assets)) {
    return [];
  }
  return block.assets
    .filter(isRecord)
    .map((asset) => ({
      url: typeof asset.url === "string" ? asset.url : "",
      type: typeof asset.type === "string" ? asset.type : "image",
      filename: typeof asset.filename === "string" ? asset.filename : undefined,
      mime_type: typeof asset.mime_type === "string" ? asset.mime_type : undefined
    }))
    .filter((asset) => asset.url.trim() !== "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const blockStyle: CSSProperties = {
  display: "grid",
  gap: 10
};

const compactBlockStyle: CSSProperties = {
  display: "grid",
  gap: 6
};

const textStyle: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap"
};

const compactTextStyle: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap"
};

const assetGridStyle: CSSProperties = {
  display: "grid",
  gap: 8
};

const imageStyle: CSSProperties = {
  maxWidth: "100%",
  maxHeight: 420,
  objectFit: "contain",
  borderRadius: 6,
  border: "1px solid var(--ui-color-border)",
  background: "var(--ui-color-bg-elevated)"
};

const compactImageStyle: CSSProperties = {
  maxWidth: "100%",
  maxHeight: 180,
  objectFit: "contain",
  borderRadius: 6,
  border: "1px solid var(--ui-color-border)",
  background: "var(--ui-color-bg-elevated)"
};
