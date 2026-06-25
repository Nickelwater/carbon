import type { JSONContent } from "@carbon/react";
import { generateHTML } from "@carbon/react";
import { Editor } from "@carbon/react/Editor";
import { useLingui } from "@lingui/react/macro";
import { LuPencil } from "react-icons/lu";

// A note "has content" when its rendered HTML contains visible text. Empty docs
// ({} or a single empty paragraph) gate the edit affordance off.
const hasContent = (notes: JSONContent) => {
  try {
    return (
      generateHTML(notes)
        .replace(/<[^>]*>/g, "")
        .trim().length > 0
    );
  } catch {
    return false;
  }
};

type EditableNotesProps = {
  value: JSONContent;
  isEditable: boolean;
  onChange: (value: JSONContent) => void;
  onUpload: (file: File) => Promise<string>;
};

/**
 * Rich-text notes that read as plain prose. When editable, the value stays a
 * live Tiptap editor; a pencil fades in on hover (and hides while focused) so
 * users can tell the prose is editable and can jump straight into it.
 */
const EditableNotes = ({
  value,
  isEditable,
  onChange,
  onUpload
}: EditableNotesProps) => {
  const { t } = useLingui();

  if (!isEditable) {
    return (
      <div
        className="prose dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: generateHTML(value) }}
      />
    );
  }

  return (
    <div className="group/notes relative">
      <Editor initialValue={value} onUpload={onUpload} onChange={onChange} />
      {hasContent(value) && (
        <button
          type="button"
          aria-label={t`Edit notes`}
          onClick={(e) =>
            e.currentTarget.parentElement
              ?.querySelector<HTMLElement>('[contenteditable="true"]')
              ?.focus()
          }
          className="absolute right-2 top-2 cursor-pointer text-muted-foreground opacity-0 transition-opacity group-hover/notes:opacity-100 group-focus-within/notes:hidden"
        >
          <LuPencil className="size-3.5" />
        </button>
      )}
    </div>
  );
};

export default EditableNotes;
