import React from 'react';
import { ActivityIndicator, View, Dimensions } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import LockScreen from '../screens/LockScreen';
import SetupPinScreen from '../screens/SetupPinScreen';
import SplashScreen from '../screens/SplashScreen';
import FolderScreen from '../screens/FolderScreen';
import MediaViewerScreen from '../screens/MediaViewerScreen';
import ChangePinScreen from '../screens/ChangePinScreen';
import MainTabs from './MainTabs';
import { Folder, MediaItem } from '../types';
import { AuthMethod } from '../context/SettingsContext';

export type RootStackParamList = {
  Splash: undefined;
  Lock: undefined;
  SetupPin: undefined;
  MainTabs: undefined;
  Folder: { folder: Folder };
  MediaViewer: { items: MediaItem[]; initialIndex: number };
  ChangePin: { targetMethod?: AuthMethod } | undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isPinSet, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      {!isAuthenticated ? (
        isPinSet ? (
          <>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Lock" component={LockScreen} />
          </>
        ) : (
          <Stack.Screen name="SetupPin" component={SetupPinScreen} />
        )
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen
            name="Folder"
            component={FolderScreen}
            options={{ gestureEnabled: true, ...TransitionPresets.SlideFromRightIOS }}
          />
          <Stack.Screen
            name="MediaViewer"
            component={MediaViewerScreen}
            options={{
              gestureEnabled: true,
              ...TransitionPresets.ModalSlideFromBottomIOS,
              gestureResponseDistance: SCREEN_HEIGHT * 0.6,
            }}
          />
          <Stack.Screen
            name="ChangePin"
            component={ChangePinScreen}
            options={{ gestureEnabled: true }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
