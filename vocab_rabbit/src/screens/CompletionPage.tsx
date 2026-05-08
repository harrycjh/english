import type { SessionResult } from '../models/daily-task';

interface CompletionPageProps {
  result: SessionResult;
  onBackHome: () => void;
}

export function CompletionPage({ result, onBackHome }: CompletionPageProps) {
  return (
    <main className="page page--complete">
      <section className="celebration-card">
        <span className="celebration-card__badge">今日任务完成</span>
        <h1>兔子已经帮你把今天的单词装进篮子里了。</h1>
        <p>
          一共回答 {result.totalAnswered} 题，其中答对 {result.correctCount} 题，答错 {result.wrongCount} 题。
        </p>
        <button className="primary-button" type="button" onClick={onBackHome}>
          回到首页
        </button>
      </section>
    </main>
  );
}