import { useAppStore } from '../../stores/app-store';

export function DifficultyPicker({ disabled }: { disabled: boolean }) {
  const difficulty = useAppStore((s) => s.aiDifficulty);
  const setDifficulty = useAppStore((s) => s.setAiDifficulty);
  return (
    <fieldset className="difficulty-picker" disabled={disabled}>
      <legend className="field-label">AI 難度</legend>
      <div className="difficulty-options">
        {(
          [
            { value: 'easy', label: 'Easy', description: '輕鬆練習' },
            { value: 'normal', label: 'Normal', description: '認真對弈' },
          ] as const
        ).map(({ value, label, description }) => (
          <label
            className="difficulty-choice"
            key={value}
            htmlFor={`difficulty-${value}`}
            aria-label={`${label}，${description}`}
          >
            <input
              id={`difficulty-${value}`}
              type="radio"
              name="ai-difficulty"
              value={value}
              checked={difficulty === value}
              onChange={() => setDifficulty(value)}
            />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
