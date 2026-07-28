interface QuestionExampleResultProps {
  sentence?: string;
  translation?: string;
  visible: boolean;
  reserveSpace?: boolean;
  className?: string;
}

export function QuestionExampleResult({
  sentence,
  translation,
  visible,
  reserveSpace = false,
  className,
}: QuestionExampleResultProps) {
  return (
    <div
      className={[
        'question-example-result',
        visible ? 'is-visible' : '',
        reserveSpace ? 'is-reserved' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      aria-live="polite"
    >
      {visible && sentence ? <p>{sentence}</p> : null}
      {visible && translation ? <span>{translation}</span> : null}
    </div>
  );
}
