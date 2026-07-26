'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Form primitives.
 *
 * The only client components in the application. Everything else renders on the
 * server, so these exist purely to surface the states the product requires:
 * saving, saved, and error — visibly, not by the button going quiet.
 */

export interface ActionResult {
  readonly error?: string;
  readonly notice?: string;
}

type Action = (state: ActionResult, formData: FormData) => Promise<ActionResult>;

interface ActionFormProps {
  readonly action: Action;
  readonly submitLabel: string;
  readonly pendingLabel?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  /** Renders the submit control full width, for mobile capture sheets. */
  readonly block?: boolean;
}

export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  className,
  block,
}: ActionFormProps) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, {});

  return (
    <form action={formAction} className={className}>
      {children}
      <div className="form-actions">
        <SubmitButton label={submitLabel} pendingLabel={pendingLabel} block={block} />
        <StatusMessage state={state} />
      </div>
    </form>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  block,
}: {
  label: string;
  pendingLabel?: string;
  block?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`button${block ? ' button-block' : ''}`}
      disabled={pending}
      // Announced to a screen reader, not just shown.
      aria-busy={pending}
    >
      {pending ? (pendingLabel ?? 'Saving…') : label}
    </button>
  );
}

function StatusMessage({ state }: { state: ActionResult }) {
  if (state.error) {
    return (
      <p className="banner banner-danger" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p className="banner banner-info" role="status">
        {state.notice}
      </p>
    );
  }
  return null;
}

/** A form whose only control is a single button, for one-tap decisions. */
export function InlineForm({
  action,
  label,
  hidden,
  variant = 'quiet',
  confirmMessage,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  hidden: Record<string, string>;
  variant?: 'quiet' | 'primary' | 'danger';
  confirmMessage?: string;
}) {
  return (
    <form
      action={action}
      className="inline-form"
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <InlineSubmit label={label} variant={variant} />
    </form>
  );
}

function InlineSubmit({ label, variant }: { label: string; variant: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`button button-${variant}`} disabled={pending}>
      {pending ? '…' : label}
    </button>
  );
}

export function Field({
  label,
  name,
  type = 'text',
  required,
  defaultValue,
  placeholder,
  hint,
  inputMode,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  hint?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel';
  step?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        step={step}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p className="faint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  name,
  rows = 3,
  required,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  rows?: number;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} name={name} rows={rows} required={required} defaultValue={defaultValue} />
      {hint && <p className="faint">{hint}</p>}
    </div>
  );
}

export function Select({
  label,
  name,
  options,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={defaultValue}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <p className="faint">{hint}</p>}
    </div>
  );
}
