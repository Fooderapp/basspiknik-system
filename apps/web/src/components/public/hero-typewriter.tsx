"use client";

import { useEffect, useState } from "react";

const TYPE_SPEED = 110;
const DELETE_SPEED = 60;
const PAUSE = 1800;

export function HeroTypewriter({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[index % words.length];
    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting) {
      if (text.length < word.length) {
        timeout = setTimeout(() => setText(word.slice(0, text.length + 1)), TYPE_SPEED);
      } else {
        timeout = setTimeout(() => setDeleting(true), PAUSE);
      }
    } else {
      if (text.length > 0) {
        timeout = setTimeout(() => setText(word.slice(0, text.length - 1)), DELETE_SPEED);
      } else {
        setDeleting(false);
        setIndex((i) => (i + 1) % words.length);
      }
    }

    return () => clearTimeout(timeout);
  }, [text, deleting, index, words]);

  return (
    <span>
      {text}
      <span className="animate-pulse">|</span>
    </span>
  );
}
