"use client";

import { useId } from "react";

// Combo input: type-ahead over existing values with free entry allowed.
// Uses a native <datalist> so it works well on phones.
export default function ComboInput({
  name,
  value,
  onChange,
  suggestions,
  placeholder,
  className = "input",
}: {
  name?: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}) {
  const listId = useId();
  const uniq = Array.from(new Set(suggestions.filter(Boolean))).sort();
  return (
    <>
      <input
        name={name}
        list={listId}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={listId}>
        {uniq.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
