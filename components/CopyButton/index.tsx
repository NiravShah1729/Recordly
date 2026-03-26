"use client";

export default function CopyButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text)}
      className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg text-sm"
    >
      Copy
    </button>
  );
}