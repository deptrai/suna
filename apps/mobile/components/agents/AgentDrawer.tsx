import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { SearchBar } from '@/components/ui/SearchBar';
import { useLanguage } from '@/contexts';
import { useAgent } from '@/contexts/AgentContext';
import { useAdvancedFeatures } from '@/hooks';
import { useBillingContext } from '@/contexts/BillingContext';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { 
  Plus, 
  Check, 
  Briefcase, 
  FileText, 
  BookOpen, 
  Zap, 
  Layers,
  Search as SearchIcon,
  ChevronRight,
  ArrowLeft,
  Crown,
  DollarSign
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Pressable, View, ScrollView, Keyboard, Alert } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  withTiming,
  useSharedValue,
  FadeIn,
  FadeOut
} from 'react-native-reanimated';
import { AgentAvatar } from './AgentAvatar';
import { ModelAvatar } from '@/components/models/ModelAvatar';
import { SelectableListItem } from '@/components/shared/SelectableListItem';
import { EntityList } from '@/components/shared/EntityList';
import { useSearch } from '@/lib/utils/search';
import { useAvailableModels } from '@/lib/models';
import type { Agent, Model } from '@/api/types';

interface AgentDrawerProps {
  visible: boolean;
  onClose: () => void;
  onCreateAgent?: () => void;
}

type ViewState = 'main' | 'agents' | 'models';

/**
 * BackButton - Reusable back button component
 */
function BackButton({ onPress }: { onPress: () => void }) {
  const { colorScheme } = useColorScheme();
  
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center active:opacity-70"
    >
      <ArrowLeft 
        size={20} 
        color={colorScheme === 'dark' ? '#f8f8f8' : '#121215'} 
      />
    </Pressable>
  );
}

/**
 * AgentDrawer Component - Dynamic agent & model selection drawer
 * 
 * Features:
 * - Blur background for modern glassmorphism effect
 * - Dynamic content switching between main, agents, and models views
 * - Smooth transitions with fade animations
 * - Back button navigation
 * - Full height utilization for all views
 */
export function AgentDrawer({
  visible,
  onClose,
  onCreateAgent
}: AgentDrawerProps) {
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const { colorScheme } = useColorScheme();
  const { t } = useLanguage();
  const { isEnabled: advancedFeaturesEnabled } = useAdvancedFeatures();
  
  // Get agents and models from context/API
  const agentContext = useAgent();
  const { agents, selectedAgentId, selectedModelId, selectAgent, selectModel, isLoading } = agentContext;
  
  // Debug: Log what we're getting from context
  React.useEffect(() => {
    console.log('🔍 AgentContext in AgentDrawer:', {
      hasSelectModel: !!selectModel,
      selectedModelId,
      selectedAgentId,
      agentsCount: agents.length
    });
  }, [selectModel, selectedModelId, selectedAgentId, agents.length]);
  
  const { data: modelsData, isLoading: modelsLoading } = useAvailableModels();
  
  // Billing context for subscription checks
  const { hasActiveSubscription, hasActiveTrial, subscriptionData } = useBillingContext();
  
  const models = modelsData?.models || [];
  const selectedAgent = agents.find(a => a.agent_id === selectedAgentId);
  
  // Get selected model - use local selection, fallback to agent's model, then recommended
  const selectedModel = React.useMemo(() => {
    if (selectedModelId) {
      const model = models.find(m => m.id === selectedModelId);
      if (model) return model;
    }
    // Fallback to agent's configured model or recommended model
    return models.find(m => m.id === selectedAgent?.model) || models.find(m => m.recommended);
  }, [selectedModelId, models, selectedAgent]);
  
  // Dynamic view state management
  const [currentView, setCurrentView] = React.useState<ViewState>('main');
  
  // Search functionality for agents
  const searchableAgents = React.useMemo(() => 
    agents.map(agent => ({ ...agent, id: agent.agent_id })), 
    [agents]
  );
  const { query: agentQuery, results: agentResults, clearSearch: clearAgentSearch, updateQuery: updateAgentQuery } = useSearch(searchableAgents, ['name', 'description']);
  const processedAgentResults = React.useMemo(() => 
    agentResults.map(result => ({ ...result, agent_id: result.id })), 
    [agentResults]
  );
  
  // Search functionality for models
  const searchableModels = React.useMemo(() => 
    models.map(model => ({ ...model, name: model.display_name })), 
    [models]
  );
  const { query: modelQuery, results: modelResults, clearSearch: clearModelSearch, updateQuery: updateModelQuery } = useSearch(searchableModels, ['display_name', 'short_name']);
  
  // Separate models into free and premium
  const { freeModels, premiumModels } = React.useMemo(() => {
    const resultsToUse = modelQuery ? modelResults : models;
    const free = resultsToUse.filter(m => !m.requires_subscription).sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const premium = resultsToUse.filter(m => m.requires_subscription).sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return { freeModels: free, premiumModels: premium };
  }, [models, modelQuery, modelResults]);
  
  // Check if user can access a model
  const canAccessModel = React.useCallback((model: Model) => {
    // If model doesn't require subscription, it's accessible
    if (!model.requires_subscription) return true;
    // Otherwise, check if user has active subscription or trial
    return hasActiveSubscription || hasActiveTrial;
  }, [hasActiveSubscription, hasActiveTrial]);

  // Handle visibility changes
  React.useEffect(() => {
    console.log('🎭 [AgentDrawer] Visibility changed:', visible);
    if (visible) {
      console.log('✅ [AgentDrawer] Opening drawer with haptic feedback');
      
      // Ensure keyboard is dismissed when drawer opens
      Keyboard.dismiss();
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      bottomSheetRef.current?.snapToIndex(0);
      setCurrentView('main'); // Reset to main view when opening
    } else {
      console.log('❌ [AgentDrawer] Closing drawer');
      bottomSheetRef.current?.close();
      // Clear searches when closing
      clearAgentSearch();
      clearModelSearch();
    }
  }, [visible, clearAgentSearch, clearModelSearch]);

  // Navigation functions
  const navigateToView = React.useCallback((view: ViewState) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentView(view);
  }, []);

  const handleAgentPress = React.useCallback(async (agent: Agent) => {
    console.log('🤖 Agent Selected:', agent.name);
    await selectAgent(agent.agent_id);
    navigateToView('main');
  }, [selectAgent, navigateToView]);

  const handleModelPress = React.useCallback((model: Model) => {
    console.log('🎯 Model Selected:', model.display_name);
    
    // Check if user can access this model
    if (!canAccessModel(model)) {
      console.log('🔒 Model requires subscription');
      Alert.alert(
        'Premium Model',
        `${model.display_name} requires an active subscription. Upgrade to access premium models with enhanced capabilities.`,
        [
          { text: 'Maybe Later', style: 'cancel' },
          { 
            text: 'Upgrade Now', 
            onPress: () => {
              // TODO: Navigate to billing screen
              console.log('Navigate to billing');
            }
          }
        ]
      );
      return;
    }
    
    // Store selected model in context - will be used when starting agent
    if (selectModel) {
      selectModel(model.id);
    } else {
      console.error('selectModel function not available in context');
    }
    navigateToView('main');
  }, [navigateToView, canAccessModel, selectModel]);

  const renderBackdrop = React.useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    []
  );

  // Render main view content
  const renderMainView = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* My Workers Section */}
      <View className="pb-3" style={{ overflow: 'visible' }}>
        <View className="flex-row items-center justify-between mb-3">
          <Text 
            style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.5)' : 'rgba(18, 18, 21, 0.5)' }}
            className="text-sm font-roobert-medium"
          >
            {t('agents.myWorkers')}
          </Text>
          {onCreateAgent && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onCreateAgent();
              }}
              className="active:opacity-70"
            >
              <Plus size={18} color={colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.5)' : 'rgba(18, 18, 21, 0.5)'} />
            </Pressable>
          )}
        </View>

        {/* Selected Worker - Clickable */}
        {selectedAgent ? (
          <SelectableListItem
            avatar={<AgentAvatar agent={selectedAgent} size={48} />}
            title={selectedAgent.name}
            subtitle={selectedAgent.description}
            showChevron
            onPress={() => navigateToView('agents')}
          />
        ) : (
          <View className="py-4 items-center">
            <Text 
              style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.6)' : 'rgba(18, 18, 21, 0.6)' }}
              className="text-sm font-roobert"
            >
              {isLoading ? t('loading.threads') : 'No worker selected'}
            </Text>
          </View>
        )}
      </View>

      {/* Divider */}
      <View 
        style={{ backgroundColor: colorScheme === 'dark' ? '#232324' : '#e0e0e0' }}
        className="h-px w-full my-3" 
      />

      {/* Models Section */}
      <View className="pb-3">
        <View className="flex-row items-center justify-between mb-3">
          <Text 
            style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.5)' : 'rgba(18, 18, 21, 0.5)' }}
            className="text-sm font-roobert-medium"
          >
            {t('models.selectModel')}
          </Text>
        </View>

        {/* Selected Model - Clickable */}
        {selectedModel ? (
          <SelectableListItem
            avatar={<ModelAvatar model={selectedModel} size={48} />}
            title={selectedModel.display_name}
            subtitle={selectedModel.short_name}
            showChevron
            onPress={() => navigateToView('models')}
          />
        ) : (
          <View className="py-4 items-center">
            <Text 
              style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.6)' : 'rgba(18, 18, 21, 0.6)' }}
              className="text-sm font-roobert"
            >
              {modelsLoading ? 'Loading models...' : 'No model selected'}
            </Text>
          </View>
        )}
      </View>

      {/* Divider & Worker Settings Section - Only show when advanced features enabled */}
      {advancedFeaturesEnabled && (
        <>
          <View 
            style={{ backgroundColor: colorScheme === 'dark' ? '#232324' : '#e0e0e0' }}
            className="h-px w-full my-3" 
          />
          
          <View className="pb-2">
            <View className="flex-row items-center justify-between mb-2.5">
              <Text 
                style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.5)' : 'rgba(18, 18, 21, 0.5)' }}
                className="text-sm font-roobert-medium"
              >
                Worker Settings
              </Text>
            </View>

            {/* Settings Icons Row */}
            <View className="flex-row gap-1.5 opacity-75">
              <Pressable 
                style={{ 
                  borderColor: colorScheme === 'dark' ? '#232324' : '#e0e0e0',
                  borderWidth: 1.5,
                }}
                className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-70"
                onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              >
                <Briefcase size={16} color={colorScheme === 'dark' ? '#f8f8f8' : '#121215'} />
              </Pressable>
              
              <Pressable 
                style={{ 
                  borderColor: colorScheme === 'dark' ? '#232324' : '#e0e0e0',
                  borderWidth: 1.5,
                }}
                className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-70"
                onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              >
                <FileText size={16} color={colorScheme === 'dark' ? '#f8f8f8' : '#121215'} />
              </Pressable>
              
              <Pressable 
                style={{ 
                  borderColor: colorScheme === 'dark' ? '#232324' : '#e0e0e0',
                  borderWidth: 1.5,
                }}
                className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-70"
                onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              >
                <BookOpen size={16} color={colorScheme === 'dark' ? '#f8f8f8' : '#121215'} />
              </Pressable>
              
              <Pressable 
                style={{ 
                  borderColor: colorScheme === 'dark' ? '#232324' : '#e0e0e0',
                  borderWidth: 1.5,
                }}
                className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-70"
                onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              >
                <Zap size={16} color={colorScheme === 'dark' ? '#f8f8f8' : '#121215'} />
              </Pressable>
              
              <Pressable 
                style={{ 
                  borderColor: colorScheme === 'dark' ? '#232324' : '#e0e0e0',
                  borderWidth: 1.5,
                }}
                className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-70"
                onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              >
                <Layers size={16} color={colorScheme === 'dark' ? '#f8f8f8' : '#121215'} />
              </Pressable>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );

  // Render agents view content
  const renderAgentsView = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Header with back button */}
      <View className="flex-row items-center mb-4">
        <BackButton onPress={() => navigateToView('main')} />
        <View className="flex-1 ml-3">
          <Text 
            style={{ color: colorScheme === 'dark' ? '#f8f8f8' : '#121215' }}
            className="text-xl font-roobert-semibold"
          >
            {t('agents.selectAgent')}
          </Text>
          <Text 
            style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.6)' : 'rgba(18, 18, 21, 0.6)' }}
            className="text-sm font-roobert"
          >
            {t('agents.chooseAgent')}
          </Text>
        </View>
      </View>

      {/* Search Bar */}
      <View className="mb-4">
        <SearchBar
          value={agentQuery}
          onChangeText={updateAgentQuery}
          placeholder={t('agents.searchAgents')}
          onClear={clearAgentSearch}
        />
      </View>

      {/* Workers List */}
      <View className="flex-row items-center justify-between mb-3">
        <Text 
          style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.5)' : 'rgba(18, 18, 21, 0.5)' }}
          className="text-sm font-roobert-medium"
        >
          {t('agents.myWorkers')}
        </Text>
        {onCreateAgent && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCreateAgent();
            }}
            className="active:opacity-70"
          >
            <Plus size={18} color={colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.5)' : 'rgba(18, 18, 21, 0.5)'} />
          </Pressable>
        )}
      </View>

      <EntityList
        entities={processedAgentResults}
        isLoading={false}
        searchQuery={agentQuery}
        emptyMessage="No workers available"
        noResultsMessage="No workers found"
        gap={4}
        renderItem={(agent) => (
          <SelectableListItem
            key={agent.agent_id}
            avatar={<AgentAvatar agent={agent} size={48} />}
            title={agent.name}
            subtitle={agent.description}
            isSelected={agent.agent_id === selectedAgentId}
            onPress={() => handleAgentPress(agent)}
            accessibilityLabel={`Select ${agent.name} worker`}
          />
        )}
      />
    </ScrollView>
  );

  // Render models view content
  const renderModelsView = () => {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header with back button */}
        <View className="flex-row items-center mb-4">
          <BackButton onPress={() => navigateToView('main')} />
          <View className="flex-1 ml-3">
            <Text 
              style={{ color: colorScheme === 'dark' ? '#f8f8f8' : '#121215' }}
              className="text-xl font-roobert-semibold"
            >
              {t('models.selectModel')}
            </Text>
            <Text 
              style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.6)' : 'rgba(18, 18, 21, 0.6)' }}
              className="text-sm font-roobert"
            >
              Choose an AI model
            </Text>
          </View>
        </View>

        {/* Search Bar */}
        <View className="mb-4">
          <SearchBar
            value={modelQuery}
            onChangeText={updateModelQuery}
            placeholder="Search models..."
            onClear={clearModelSearch}
          />
        </View>

        {modelsLoading ? (
          <View className="py-8 items-center">
            <Text 
              style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.6)' : 'rgba(18, 18, 21, 0.6)' }}
              className="text-sm font-roobert"
            >
              Loading models...
            </Text>
          </View>
        ) : (
          <>
            {/* Free Models Section */}
            {freeModels.length > 0 && (
              <View className="mb-4">
                <Text 
                  style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.5)' : 'rgba(18, 18, 21, 0.5)' }}
                  className="text-xs font-roobert-medium mb-3 uppercase tracking-wide"
                >
                  Available Models
                </Text>
                <EntityList
                  entities={freeModels}
                  isLoading={false}
                  gap={3}
                  renderItem={(model) => (
                    <SelectableListItem
                      key={model.id}
                      avatar={<ModelAvatar model={model} size={48} />}
                      title={model.display_name}
                      subtitle={model.short_name}
                      isSelected={model.id === selectedModel?.id}
                      onPress={() => handleModelPress(model)}
                      accessibilityLabel={`Select ${model.display_name} model`}
                    />
                  )}
                />
              </View>
            )}

            {/* Premium Models Section */}
            {premiumModels.length > 0 && (
              <View>
                <View className="flex-row items-center mb-3">
                  <Crown size={14} color={colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.5)' : 'rgba(18, 18, 21, 0.5)'} />
                  <Text 
                    style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.5)' : 'rgba(18, 18, 21, 0.5)' }}
                    className="text-xs font-roobert-medium ml-1.5 uppercase tracking-wide"
                  >
                    {hasActiveSubscription || hasActiveTrial ? 'Premium Models' : 'Additional Models'}
                  </Text>
                </View>
                
                {/* Show max 3 premium models if user doesn't have subscription */}
                {(!hasActiveSubscription && !hasActiveTrial) ? (
                  <>
                    <EntityList
                      entities={premiumModels.slice(0, 3)}
                      isLoading={false}
                      gap={3}
                      renderItem={(model) => (
                        <View key={model.id} style={{ opacity: canAccessModel(model) ? 1 : 0.7 }}>
                          <SelectableListItem
                            avatar={<ModelAvatar model={model} size={48} />}
                            title={model.display_name}
                            subtitle={model.short_name}
                            isSelected={model.id === selectedModel?.id}
                            onPress={() => handleModelPress(model)}
                            accessibilityLabel={`Select ${model.display_name} model`}
                          />
                        </View>
                      )}
                    />
                    
                    {/* Upgrade CTA */}
                    <View 
                      style={{ 
                        backgroundColor: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.05)' : 'rgba(18, 18, 21, 0.03)',
                        borderColor: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.1)' : 'rgba(18, 18, 21, 0.1)',
                      }}
                      className="mt-4 p-4 rounded-2xl border"
                    >
                      <View className="flex-row items-start mb-2">
                        <Crown size={16} color={colorScheme === 'dark' ? '#f8f8f8' : '#121215'} />
                        <Text 
                          style={{ color: colorScheme === 'dark' ? '#f8f8f8' : '#121215' }}
                          className="text-sm font-roobert-semibold ml-2 flex-1"
                        >
                          Unlock all models + higher limits
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          // TODO: Navigate to billing
                          console.log('Navigate to billing');
                        }}
                        style={{
                          backgroundColor: colorScheme === 'dark' ? '#f8f8f8' : '#121215',
                        }}
                        className="py-2.5 rounded-xl items-center active:opacity-80"
                      >
                        <Text 
                          style={{ color: colorScheme === 'dark' ? '#121215' : '#f8f8f8' }}
                          className="text-sm font-roobert-semibold"
                        >
                          Upgrade now
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <EntityList
                    entities={premiumModels}
                    isLoading={false}
                    gap={3}
                    renderItem={(model) => (
                      <SelectableListItem
                        key={model.id}
                        avatar={<ModelAvatar model={model} size={48} />}
                        title={model.display_name}
                        subtitle={model.short_name}
                        isSelected={model.id === selectedModel?.id}
                        onPress={() => handleModelPress(model)}
                        accessibilityLabel={`Select ${model.display_name} model`}
                      />
                    )}
                  />
                )}
              </View>
            )}

            {/* Empty State */}
            {freeModels.length === 0 && premiumModels.length === 0 && (
              <View className="py-8 items-center">
                <Text 
                  style={{ color: colorScheme === 'dark' ? 'rgba(248, 248, 248, 0.6)' : 'rgba(18, 18, 21, 0.6)' }}
                  className="text-sm font-roobert"
                >
                  {modelQuery ? 'No models match your search' : 'No models available'}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    );
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={['95%']}
      enablePanDownToClose
      onChange={(index) => index === -1 && onClose()}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ 
        backgroundColor: colorScheme === 'dark' 
          ? '#161618' 
          : '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      handleIndicatorStyle={{ 
        backgroundColor: colorScheme === 'dark' ? '#3F3F46' : '#D4D4D8',
        width: 36,
        height: 5,
        borderRadius: 3,
      }}
    >
      {/* Content with proper height management */}
      <BottomSheetView
        style={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 32,
        }}
      >
        {/* Dynamic content based on current view */}
        {currentView === 'main' && (
          <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
            {renderMainView()}
          </Animated.View>
        )}
        
        {currentView === 'agents' && (
          <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
            {renderAgentsView()}
          </Animated.View>
        )}
        
        {currentView === 'models' && (
          <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
            {renderModelsView()}
          </Animated.View>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}