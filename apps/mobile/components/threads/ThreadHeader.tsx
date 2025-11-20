import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { EpsilonLoader } from '@/components/ui';
import { useLanguage } from '@/contexts';
import * as React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleEllipsis, Menu, MessageCircleMore, MoreHorizontal, TextAlignStart } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ThreadHeaderProps {
  threadTitle?: string;
  onTitleChange?: (newTitle: string) => void;
  onMenuPress?: () => void;
  onActionsPress?: () => void;
  isLoading?: boolean;
}

/**
 * ThreadHeader Component
 * 
 * Clean, minimal header inspired by SettingsHeader design
 * Matches the BillingPage aesthetic with proper spacing and layout
 */
export function ThreadHeader({
  threadTitle,
  onTitleChange,
  onMenuPress,
  onActionsPress,
  isLoading = false,
}: ThreadHeaderProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editedTitle, setEditedTitle] = React.useState(threadTitle || '');
  const [isUpdating, setIsUpdating] = React.useState(false);
  const titleInputRef = React.useRef<TextInput>(null);

  const menuScale = useSharedValue(1);
  const actionScale = useSharedValue(1);

  const menuAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: menuScale.value }],
  }));

  const actionAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: actionScale.value }],
  }));

  React.useEffect(() => {
    if (threadTitle && threadTitle.trim()) {
      setEditedTitle(threadTitle);
    } else {
      setEditedTitle('');
    }
  }, [threadTitle]);

  const handleMenuPress = () => {
    console.log('🎯 Menu panel pressed (Thread View)');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onMenuPress?.();
  };

  const handleTitlePress = () => {
    console.log('🎯 Thread title tapped');
    setIsEditingTitle(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 100);
  };

  const handleTitleBlur = async () => {
    console.log('✏️ Title editing finished');
    setIsEditingTitle(false);

    if (editedTitle !== threadTitle && editedTitle.trim()) {
      console.log('💾 Saving new thread title:', editedTitle);
      setIsUpdating(true);

      try {
        await onTitleChange?.(editedTitle.trim());
        console.log('✅ Thread title updated successfully');
      } catch (error) {
        console.error('❌ Failed to update thread title:', error);
        setEditedTitle(threadTitle || '');
      } finally {
        setIsUpdating(false);
      }
    } else {
      setEditedTitle(threadTitle || '');
    }
  };

  const handleActionsPress = () => {
    console.log('🎯 Thread actions menu pressed');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onActionsPress?.();
  };

  return (
    <View
      className="absolute top-0 left-0 right-0 bg-background border-b border-border/20"
      style={{
        paddingTop: Math.max(insets.top, 16) + 8,
        paddingBottom: 8,
        zIndex: 0,
      }}
    >
      <View className="px-3 flex-row items-center gap-3">
        <AnimatedPressable
          onPressIn={() => {
            menuScale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
          }}
        />

        {/* Main Content - Compact and minimal */}
        <View className="flex-row items-center justify-between px-3 py-2">
          {/* Left - Menu Button */}
          <AnimatedPressable
            onPressIn={() => {
              menuScale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
            }}
            onPressOut={() => {
              menuScale.value = withSpring(1, { damping: 15, stiffness: 400 });
            }}
            onPress={handleMenuPress}
            style={menuAnimatedStyle}
            className="w-7 h-7 items-center justify-center -ml-1"
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <Icon as={Menu} size={18} className="text-foreground/60" strokeWidth={2} />
          </AnimatedPressable>

          {/* Center - Thread Title (Editable) */}
          <View className="flex-1 mx-2.5 flex-row items-center justify-center">
            {isLoading || isUpdating ? (
              <EpsilonLoader size="small" />
            ) : isEditingTitle ? (
              <TextInput
                ref={titleInputRef}
                value={editedTitle}
                onChangeText={setEditedTitle}
                onBlur={handleTitleBlur}
                onSubmitEditing={handleTitleBlur}
                className="text-[13px] font-roobert-medium text-foreground text-center flex-1"
                style={{ fontFamily: 'Roobert-Medium' }}
                placeholder="Enter title"
                placeholderTextColor={colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.3)' : 'rgba(0, 0, 0, 0.3)'}
                returnKeyType="done"
                selectTextOnFocus
                accessibilityLabel="Edit thread title"
              />
            ) : editedTitle ? (
              <Pressable 
                onPress={handleTitlePress} 
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                className="flex-1"
              >
                {threadTitle && threadTitle.trim() ? threadTitle : 'Untitled'}
              </Text>
            </Pressable>
          )}

          {(isUpdating || isLoading) && (
            <View className="ml-2">
              <KortixLoader size="large" />
            </View>
          )}
        </View>

        {/* Actions Button */}
        <AnimatedPressable
          onPressIn={() => {
            actionScale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
          }}
          onPressOut={() => {
            actionScale.value = withSpring(1, { damping: 15, stiffness: 400 });
          }}
          onPress={handleActionsPress}
          style={actionAnimatedStyle}
          className="w-8 h-8 items-center justify-center rounded-full"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Thread actions"
        >
          <Icon as={MessageCircleMore} size={20} className="text-foreground" strokeWidth={2} />
        </AnimatedPressable>
      </View>
    </View>
  );
}