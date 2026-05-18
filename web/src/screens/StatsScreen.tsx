import { Card, Heading, MetaText } from "../components/ui";

export function StatsScreen() {
  return (
    <div className="screen-content">
      <header>
        <Heading>Statistics</Heading>
        <MetaText>Lightweight progress, no pressure.</MetaText>
      </header>

      <div className="stat-grid">
        <Card as="article">
          <p className="card-title">Today</p>
          <p className="stat-value">10 cards</p>
          <MetaText>Quick lesson done</MetaText>
        </Card>
        <Card as="article">
          <p className="card-title">This week</p>
          <p className="stat-value">26 cards</p>
          <MetaText>4 active days</MetaText>
        </Card>
      </div>
    </div>
  );
}
