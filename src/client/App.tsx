import { useRoute } from './lib/router';
import { CardScreen } from './screens/CardScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ScannerScreen } from './screens/ScannerScreen';

export function App() {
  const route = useRoute();
  if (route.name === 'scan') return <ScannerScreen />;
  if (route.name === 'card') return <CardScreen key={route.id} id={route.id} />;
  return <HomeScreen />;
}
