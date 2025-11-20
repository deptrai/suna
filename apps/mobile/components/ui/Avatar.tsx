import { Icon } from '@/components/ui/icon';
import { KortixLogo } from '@/components/ui/KortixLogo';
import * as React from 'react';
import { View, type ViewProps, Text } from 'react-native';
import { useColorScheme } from 'nativewind';
import { getIconFromName } from '@/lib/utils/icon-mapping';
import { MessageSquare, Zap, Layers } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import EpsilonSymbol from '@/assets/brand/Symbol.svg';
        />
      ) : IconComponent ? (
        <Icon 
          as={IconComponent} 
          size={iconSize} 
          color={finalIconColor}
          strokeWidth={2.5}
        />
      ) : fallbackText ? (
        <Text 
          style={{ 
            color: finalIconColor,
            fontSize: size * 0.4,
            fontWeight: '600'
          }}
        >
          {fallbackText.charAt(0).toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}

