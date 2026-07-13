// Password rules, shared by the signup and reset-password screens so the live
// checklist and the submit gate always agree.

export type PwCheck = { label: string; met: boolean };

export function passwordChecks(pw: string): PwCheck[] {
  return [
    { label: "At least 8 characters", met: pw.length >= 8 },
    { label: "A letter (a–z or A–Z)", met: /[a-zA-Z]/.test(pw) },
    { label: "A number (0–9)", met: /[0-9]/.test(pw) },
    { label: "A special character (!@#$…)", met: /[^a-zA-Z0-9]/.test(pw) },
  ];
}

export function isPasswordValid(pw: string): boolean {
  return passwordChecks(pw).every((c) => c.met);
}
