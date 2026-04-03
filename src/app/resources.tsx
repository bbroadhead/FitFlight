import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { Asset } from 'expo-asset';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react-native';

type ResourceItem = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  moduleId: number;
};

const RESOURCES: ResourceItem[] = [
  {
    id: 'dafman-36-2905',
    title: 'DAFMAN 36-2905',
    subtitle: 'Official Air Force fitness guidance',
    description: 'Open the current DAFMAN 36-2905 PDF from the app bundle.',
    moduleId: require('../../assets/docs/DAFMAN 36-2905.pdf'),
  },
  {
    id: 'warfighters-fitness-playbook',
    title: "Warfighter's Fitness Playbook 2.0",
    subtitle: 'February 2026 edition',
    description: 'Open the latest Warfighter fitness reference guide included in the app.',
    moduleId: require("../../assets/docs/The Warfighter's Fitness Playbook 2.0 Feb 2026.pdf"),
  },
];

export default function ResourcesScreen() {
  const router = useRouter();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const openResource = async (resource: ResourceItem) => {
    try {
      setOpeningId(resource.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const asset = Asset.fromModule(resource.moduleId);
      if (!asset.localUri) {
        await asset.downloadAsync();
      }

      const uri = asset.localUri ?? asset.uri;
      if (!uri) {
        throw new Error('Missing document URI');
      }

      if (Platform.OS === 'web') {
        window.open(uri, '_blank', 'noopener,noreferrer');
        return;
      }

      await WebBrowser.openBrowserAsync(uri, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch (error) {
      Alert.alert(
        'Unable to Open Document',
        'The document could not be opened right now. Please try again in a moment.'
      );
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0A1628', '#001F5C', '#0A1628']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView edges={['top']} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            className="px-6 pt-4 pb-2"
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              className="flex-row items-center self-start mb-6"
            >
              <ArrowLeft size={18} color="#C0C0C0" />
              <Text className="text-af-silver font-medium ml-2">Back</Text>
            </Pressable>

            <Text className="text-white text-3xl font-bold">Resources</Text>
            <Text className="text-af-silver text-sm mt-2">
              Access official fitness guidance and reference documents.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="mx-6 mt-4 p-4 bg-white/5 rounded-2xl border border-white/10"
          >
            <Text className="text-white/60 text-xs uppercase tracking-wider mb-2">Official Documents</Text>
            <Text className="text-af-silver text-sm">
              These PDFs open in your browser or device viewer.
            </Text>
          </Animated.View>

          {RESOURCES.map((resource, index) => (
            <Animated.View
              key={resource.id}
              entering={FadeInDown.delay(200 + index * 50).springify()}
              className="mx-6 mt-4"
            >
              <Pressable
                onPress={() => openResource(resource)}
                className="bg-white/5 border border-white/10 rounded-2xl p-5"
              >
                <View className="flex-row items-start">
                  <View className="w-12 h-12 rounded-2xl bg-af-accent/20 items-center justify-center">
                    <FileText size={24} color="#4A90D9" />
                  </View>
                  <View className="ml-4 flex-1">
                    <Text className="text-white text-lg font-semibold">{resource.title}</Text>
                    <Text className="text-af-accent text-sm mt-1">{resource.subtitle}</Text>
                    <Text className="text-af-silver text-sm mt-3">{resource.description}</Text>
                  </View>
                  <ExternalLink size={18} color="#C0C0C0" />
                </View>

                <View className="mt-4 pt-4 border-t border-white/10">
                  <Text className="text-white font-medium">
                    {openingId === resource.id ? 'Opening document...' : 'Tap to open'}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
