import React, { useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useRock } from './src/lib/rock';
import { SetupScreen } from './src/screens/SetupScreen';
import { StatusScreen } from './src/screens/StatusScreen';
import { makeStyles } from './src/theme';

function App() {
  const styles = useStyles();
  const rock = useRock();
  const [editing, setEditing] = useState(false);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        {rock == null || editing ? (
          <SetupScreen
            rock={rock}
            onDone={() => setEditing(false)}
            onCancel={rock ? () => setEditing(false) : undefined}
          />
        ) : (
          <StatusScreen rock={rock} onEdit={() => setEditing(true)} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const useStyles = makeStyles(colors => ({
  root: { flex: 1, backgroundColor: colors.ink },
}));

export default App;
