"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MefBadge, MefButton } from "../../mef-primitives";

const preferenceSchema = z.object({ preference: z.string().trim().min(3, "Use at least 3 characters").max(120, "Keep the preference under 120 characters") });
type PreferenceValues = z.infer<typeof preferenceSchema>;

export function MefSessionPreferenceForm({ onSaved, onCancel }: Readonly<{ onSaved: (preference: string) => void; onCancel: () => void }>) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PreferenceValues>({ resolver: zodResolver(preferenceSchema), defaultValues: { preference: "" }, mode: "onBlur" });
  return (
    <form className="mef-memory-draft" id="mef-memory-draft" onSubmit={handleSubmit((values) => onSaved(values.preference))}>
      <label className="mef-field"><span className="mef-field-label">Preference</span><input autoFocus maxLength={120} placeholder="Example: keep review summaries concise" {...register("preference")} aria-describedby="mef-preference-help" aria-invalid={errors.preference ? "true" : "false"} />{errors.preference ? <span className="mef-field-error" role="alert">{errors.preference.message}</span> : <span className="mef-field-hint" id="mef-preference-help">Session-only, visible, and deletable.</span>}</label>
      <div className="mef-memory-draft-actions"><MefBadge>Session-only</MefBadge><div><MefButton disabled={isSubmitting} onClick={onCancel} size="sm" tone="secondary" type="button">Cancel</MefButton><MefButton disabled={isSubmitting} size="sm" icon="check" type="submit">Keep draft</MefButton></div></div>
      <p className="mef-field-hint">This preview does not write to the server or evidence chain.</p>
    </form>
  );
}
