import { AppProviders } from "./providers";
import { AppShell } from "./layout/app-shell";

export default function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
