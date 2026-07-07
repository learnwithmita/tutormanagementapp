// Standard shape every server action returns so the UI can render inline field
// errors and a top-of-form server-error banner consistently.
export type FormState = {
  ok: boolean;
  // Top-of-form server/general error banner.
  error?: string;
  // Per-field inline validation errors, keyed by field name.
  fieldErrors?: Record<string, string>;
  // Optional non-blocking warning that the UI may surface and let the user
  // proceed past (e.g. unknown template placeholder, duplicate name).
  warning?: string;
  // Optional success message for toasts.
  message?: string;
};

export const emptyFormState: FormState = { ok: false };
