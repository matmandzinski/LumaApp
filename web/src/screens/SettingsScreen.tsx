import { Card, Heading, MetaText } from "../components/ui";

export function SettingsScreen() {
  return (
    <div className="screen-content">
      <header>
        <Heading>Settings</Heading>
        <MetaText>Keep things simple and personal.</MetaText>
      </header>

      <Card as="article">
        <p className="card-title">Daily Reminder</p>
        <MetaText>18:30 - gentle reminder enabled</MetaText>
      </Card>
      <Card as="article">
        <p className="card-title">Theme</p>
        <MetaText>Calm light mode</MetaText>
      </Card>
      <Card as="article">
        <p className="card-title">Language</p>
        <MetaText>English</MetaText>
      </Card>
    </div>
  );
}
