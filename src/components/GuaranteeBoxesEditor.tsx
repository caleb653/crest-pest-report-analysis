import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import RichTextEditor from "@/components/RichTextEditor";
import {
  GuaranteeBox,
  buildDefaultRodentBox,
  newCustomGuaranteeBox,
  RODENT_DEFAULT_BOX_ID,
} from "@/lib/rodentGuarantee";

interface Props {
  boxes: GuaranteeBox[];
  onChange: (next: GuaranteeBox[]) => void;
  /** If true, show "Add Default Rodent Box" button when no rodent box exists. */
  showRodentDefaultButton?: boolean;
}

/**
 * Editable list of Guarantee & Warranty boxes shown on admin reports
 * (Sales Report + Multi-Proposal). Each box has an editable title and
 * rich-text body. Auto-seeded rodent boxes are fully editable/deletable;
 * the admin can also add arbitrary boxes for any service.
 */
const GuaranteeBoxesEditor: React.FC<Props> = ({ boxes, onChange, showRodentDefaultButton }) => {
  const [fontSize, setFontSize] = useState(12);

  const updateBox = (idx: number, patch: Partial<GuaranteeBox>) => {
    const next = boxes.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    onChange(next);
  };
  const removeBox = (idx: number) => onChange(boxes.filter((_, i) => i !== idx));
  const addCustom = () => onChange([...boxes, newCustomGuaranteeBox()]);
  const addRodentDefault = () => onChange([...boxes, buildDefaultRodentBox()]);

  const hasRodentDefault = boxes.some((b) => b.id === RODENT_DEFAULT_BOX_ID);

  return (
    <div className="space-y-2">
      {boxes.map((box, idx) => (
        <Card key={box.id} className="p-0 overflow-hidden rounded-lg border">
          <div className="print-section-header py-1.5 px-2.5 flex items-center gap-2 rounded-t-lg">
            <Input
              value={box.title}
              onChange={(e) => updateBox(idx, { title: e.target.value })}
              placeholder="Box title (e.g. Mosquito Service Guarantee)"
              className="h-7 text-xs font-bold uppercase bg-white/90 border-0 focus-visible:ring-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeBox(idx)}
              className="h-7 w-7 shrink-0 text-white hover:bg-white/20 no-print"
              aria-label="Remove box"
              title="Remove box"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="p-2 print:p-1.5">
            <RichTextEditor
              value={box.html}
              onChange={(html) => updateBox(idx, { html })}
              placeholder="Enter guarantee / warranty details..."
              fontSize={fontSize}
              onFontSizeChange={setFontSize}
              showControls
              className="min-h-[80px]"
            />
          </div>
        </Card>
      ))}
      <div className="flex flex-wrap gap-2 no-print">
        <Button type="button" variant="outline" size="sm" onClick={addCustom} className="h-7 text-xs">
          <Plus className="w-3 h-3" /> Add Guarantee / Warranty Box
        </Button>
        {showRodentDefaultButton && !hasRodentDefault && (
          <Button type="button" variant="outline" size="sm" onClick={addRodentDefault} className="h-7 text-xs">
            <Plus className="w-3 h-3" /> Add Rodent Default
          </Button>
        )}
      </div>
    </div>
  );
};

export default GuaranteeBoxesEditor;

/** Read-only render used by the customer view + PDF. */
export const GuaranteeBoxesReadOnly: React.FC<{
  boxes: GuaranteeBox[];
  headerClassName?: string;
  bodyClassName?: string;
  cardClassName?: string;
}> = ({ boxes, headerClassName, bodyClassName, cardClassName }) => {
  if (!boxes || boxes.length === 0) return null;
  return (
    <>
      {boxes.map((box) => (
        <Card key={box.id} className={cardClassName ?? "overflow-hidden"}>
          <div className={headerClassName ?? "bg-brand-black text-white px-4 py-2"}>
            <span className="text-xs font-bold uppercase">{box.title || "Guarantee & Warranty"}</span>
          </div>
          <div className={bodyClassName ?? "p-4"}>
            <div
              className="text-xs leading-relaxed prose prose-xs max-w-none text-foreground/90"
              dangerouslySetInnerHTML={{ __html: box.html || "" }}
            />
          </div>
        </Card>
      ))}
    </>
  );
};