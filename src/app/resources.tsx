import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Asset } from 'expo-asset';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { PageContainer } from '@/components/PageContainer';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { getThemeBodyStyle, getThemeControlStyle, getThemeHeadingStyle, getThemeIconWellStyle, useAppTheme } from '@/lib/theme';

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
  {
    id: 'pfra-scoring-charts',
    title: 'PFRA Scoring Charts',
    subtitle: 'Effective 1 March 2026',
    description: 'Open the official PFRA scoring charts included in the app bundle.',
    moduleId: require('../../assets/docs/PFRA Scoring Charts.pdf'),
  },
];

export default function ResourcesScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [activeWebDocument, setActiveWebDocument] = useState<{ title: string; uri: string } | null>(null);
  const contentMaxWidth = width >= 1440 ? 1120 : width >= 1180 ? 980 : 860;

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

      setActiveWebDocument({
        title: resource.title,
        uri,
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
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <ThemeBackdrop />

      <SafeAreaView edges={['top']} className="flex-1">
        {activeWebDocument ? (
          <View className="flex-1 px-4 pb-4">
            <View className="flex-row items-center justify-between px-2 pt-4 pb-3">
              <Pressable
                onPress={() => setActiveWebDocument(null)}
                className="flex-row items-center rounded-full px-4 py-2"
                style={getThemeControlStyle(theme)}
              >
                <ArrowLeft size={16} color={theme.textSecondary} />
                <Text className="ml-2 font-medium" style={{ color: theme.textSecondary }}>Back to Resources</Text>
              </Pressable>
                    <Text className="font-semibold ml-4 flex-1" style={{ color: theme.textPrimary }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{activeWebDocument.title}</Text>
            </View>
            {Platform.OS === 'web' ? (
              // @ts-ignore web-only iframe
              <iframe
                src={activeWebDocument.uri}
                title={activeWebDocument.title}
                style={{
                  flex: 1,
                  width: '100%',
                  height: '100%',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 20,
                  backgroundColor: theme.background,
                }}
              />
            ) : (
              <View style={{ flex: 1, overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                <WebView
                  source={{ uri: activeWebDocument.uri }}
                  style={{ flex: 1, backgroundColor: theme.background }}
                  allowsBackForwardNavigationGestures
                  scalesPageToFit
                  setBuiltInZoomControls
                  setDisplayZoomControls={false}
                />
              </View>
            )}
          </View>
        ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 48, alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          <PageContainer maxWidth={contentMaxWidth}>
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

            <Text style={getThemeHeadingStyle(theme, 30)}>Resources</Text>
            <Text style={[getThemeBodyStyle(theme, 14), { marginTop: 8 }]}>
              Access official fitness guidance and reference documents.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="mx-6 mt-4"
          >
            <ThemeChrome theme={theme} variant="feature">
              <View className="p-4">
                <Text style={[getThemeBodyStyle(theme, 11, theme.textMuted), { textTransform: 'uppercase', marginBottom: 8 }]}>Official Documents</Text>
                <Text style={getThemeBodyStyle(theme, 14)}>These PDFs open in the in-app document viewer with full-page scrolling.</Text>
              </View>
            </ThemeChrome>
          </Animated.View>

          {RESOURCES.map((resource, index) => (
            <Animated.View
              key={resource.id}
              entering={FadeInDown.delay(200 + index * 50).springify()}
              className="mx-6 mt-4"
            >
              <Pressable
                onPress={() => openResource(resource)}
              >
                <ThemeChrome theme={theme}>
                  <View className="p-5">
                    <View className="flex-row items-start">
                      <View className="w-12 h-12 rounded-2xl items-center justify-center" style={getThemeIconWellStyle(theme)}>
                        <FileText size={24} color={theme.accent} />
                      </View>
                      <View className="ml-4 flex-1">
                        <Text className="text-lg font-semibold" style={{ color: theme.textPrimary }}>{resource.title}</Text>
                        <Text className="text-sm mt-1" style={{ color: theme.accent }}>{resource.subtitle}</Text>
                        <Text className="text-sm mt-3" style={getThemeBodyStyle(theme, 14)}>{resource.description}</Text>
                      </View>
                      <ExternalLink size={18} color={theme.textSecondary} />
                    </View>

                    <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: theme.border }}>
                      <Text style={{ color: theme.textPrimary, fontWeight: '500' }}>
                        {openingId === resource.id ? 'Opening document...' : 'Tap to open'}
                      </Text>
                    </View>
                  </View>
                </ThemeChrome>
              </Pressable>
            </Animated.View>
          ))}
          </PageContainer>
        </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
