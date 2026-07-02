// Minimal, self-contained Tiptap JSON types. Deliberately not imported from
// anvilnote-web or @tiptap/core — this package only needs to read a handful
// of node shapes, and duplicating that sliver keeps this repo buildable and
// versioned independently of the editor's dependency graph.

export type TiptapMark = {
  type?: string;
  attrs?: Record<string, unknown>;
};

export type TiptapNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
};

// The input this package's CLI/library entry point accepts: a document title
// plus its Tiptap `doc` node (AnvilDocument.content, unwrapped).
export type ExportDocxInput = {
  title: string;
  content: TiptapNode;
};
