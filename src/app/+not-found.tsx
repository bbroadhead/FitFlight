import { Stack } from 'expo-router';
import { Image, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'FitFlight' }} />
      <View className="flex-1 bg-af-navy px-6 items-center justify-center">
        <View className="w-full max-w-md items-center">
          <View className="w-24 h-24 rounded-[28px] bg-white/10 border border-white/15 items-center justify-center mb-8 overflow-hidden">
            <Image
              source={require('../../assets/images/TotalFlight_Icon_Resized.png')}
              style={{ width: '72%', height: '72%' }}
              resizeMode="contain"
            />
          </View>
          <Text className="text-white text-3xl font-bold text-center">App under maintenance.</Text>
          <Text className="text-af-silver text-lg text-center mt-3">Check back again soon!</Text>
        </View>
      </View>
    </>
  );
}
