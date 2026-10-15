import React, { useEffect, useState } from 'react';
import {
  AppState,
  Linking,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PairLink, parsePairLink } from './src/lib/pair';
import { useRock } from './src/lib/rock';
import { SetupScreen } from './src/screens/SetupScreen';
import { StatusScreen } from './src/screens/StatusScreen';
import { fonts, makeStyles } from './src/theme';

function App() {
  const styles = useStyles();
  const rock = useRock();
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState<PairLink | null>(null);
  const [covered, setCovered] = useState(false);

  // The QR code on the Umbrel page is a rockit://pair link: the iPhone
  // Camera opens it here.
  useEffect(() => {
    const open = (url: string | null | undefined) => {
      const found = url ? parsePairLink(url) : null;
      if (found) setLink(found);
    };
    Linking.getInitialURL().then(open, () => {});
    const sub = Linking.addEventListener('url', e => open(e.url));
    return () => sub.remove();
  }, []);

  // Hide the screen in the app switcher.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state =>
      setCovered(state !== 'active'),
    );
    return () => sub.remove();
  }, []);

  const done = () => {
    setEditing(false);
    setLink(null);
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        {rock == null || editing || link ? (
          <SetupScreen
            key={link ? `${link.address.host}-${link.code}` : 'setup'}
            rock={rock}
            link={link}
            onDone={done}
            onCancel={rock || link ? done : undefined}
          />
        ) : (
          <StatusScreen rock={rock} onEdit={() => setEditing(true)} />
        )}
      </SafeAreaView>
      {covered ? (
        <View style={styles.cover} pointerEvents="none">
          <Text style={styles.coverText}>Zecky Rock it</Text>
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}

const useStyles = makeStyles(colors => ({
  root: { flex: 1, backgroundColor: colors.ink },
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverText: { fontFamily: fonts.serif, fontSize: 28, color: colors.gold },
}));

export default App;
