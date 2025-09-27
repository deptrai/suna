# ChainLens Crypto Services - Coding Standards

## BMAD Method Compliance

This document defines coding standards for ChainLens Crypto Services following BMAD (Business Model Architecture Development) methodology.

## 1. Project Structure Standards

### 1.1 Directory Organization
```
services/
├── chainlens-core/           # API Gateway & Orchestrator
├── onchain-analysis/         # OnChain Analysis Microservice
├── sentiment-analysis/       # Sentiment Analysis Microservice
├── tokenomics-analysis/      # Tokenomics Analysis Microservice
├── team-verification/        # Team Verification Microservice
├── scripts/                  # Development & deployment scripts
├── k8s/                     # Kubernetes configurations
└── monitoring/              # Monitoring configurations
```

### 1.2 Service Structure (NestJS)
```
src/
├── main.ts                  # Application entry point
├── app.module.ts           # Root module
├── auth/                   # Authentication module
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── guards/            # Auth guards
│   ├── strategies/        # Passport strategies
│   ├── decorators/        # Custom decorators
│   └── constants/         # Auth constants
├── common/                # Shared utilities
│   ├── filters/          # Exception filters
│   ├── interceptors/     # Request/response interceptors
│   ├── middleware/       # Custom middleware
│   └── services/         # Shared services
├── config/               # Configuration modules
├── database/             # Database configuration
└── [feature]/           # Feature modules
    ├── [feature].module.ts
    ├── [feature].controller.ts
    ├── [feature].service.ts
    └── dto/             # Data Transfer Objects
```

## 2. TypeScript Standards

### 2.1 Strict Configuration
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 2.2 Interface Definitions
```typescript
// ✅ CORRECT: Comprehensive interface
export interface UserContext {
  id: string;
  email: string;
  role: UserRole;
  tier: UserTier;
  rateLimit: {
    requests: number;
    window: number;
  };
  metadata?: any;
}

// ✅ CORRECT: Enum usage
export enum UserRole {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
  ADMIN = 'admin'
}
```

### 2.3 Error Handling
```typescript
// ✅ CORRECT: Comprehensive error handling
async validate(payload: JwtPayload): Promise<UserContext> {
  try {
    this.logger.debug('Validating JWT payload', { userId: payload.sub });
    
    // Validation logic
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }
    
    return userContext;
  } catch (error) {
    this.logger.error('JWT validation failed', error.stack, 'JwtStrategy');
    
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    
    throw new UnauthorizedException('Token validation failed');
  }
}
```

## 3. NestJS Standards

### 3.1 Module Structure
```typescript
// ✅ CORRECT: Comprehensive module definition
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
    ConfigModule.forFeature(supabaseConfig),
  ],
  controllers: [AuthController, AuthTestController, UserController],
  providers: [
    AuthService,
    UserService,
    SupabaseService,
    JwtStrategy,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    UserService,
    SupabaseService,
    JwtStrategy,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    RolesGuard,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule {}
```

### 3.2 Controller Standards
```typescript
// ✅ CORRECT: RESTful controller with proper decorators
@ApiTags('User Management')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly logger: LoggerService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getCurrentUser(@CurrentUser() currentUser: UserContext): Promise<ApiResponse<any>> {
    try {
      this.logger.debug('Getting current user profile', { userId: currentUser.id });
      
      const user = await this.userService.getUserById(currentUser.id);
      
      return {
        success: true,
        data: {
          user,
          message: 'User profile retrieved successfully'
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0'
        },
        errors: []
      };
    } catch (error) {
      this.logger.error('Error getting current user', error.stack, 'UserController');
      throw new BadRequestException('Failed to get user profile');
    }
  }
}
```

### 3.3 Service Standards
```typescript
// ✅ CORRECT: Service with dependency injection
@Injectable()
export class UserService {
  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
    private logger: LoggerService,
  ) {}

  async getUserById(userId: string): Promise<UserProfile> {
    try {
      this.logger.debug('Getting user by ID', { userId });
      
      // Try to get from Supabase first
      let supabaseUser = null;
      try {
        supabaseUser = await this.supabaseService.getUserProfile(userId);
      } catch (error) {
        this.logger.debug('Profile not found, using defaults', { 
          userId, 
          error: error.message 
        });
      }
      
      // Return user profile with fallback
      return {
        id: userId,
        email: supabaseUser?.email || 'unknown@chainlens.com',
        role: supabaseUser?.role || 'free',
        tier: supabaseUser?.tier || 'free',
        isActive: supabaseUser?.isActive ?? true,
        metadata: supabaseUser?.metadata || {},
        created_at: supabaseUser?.created_at || new Date().toISOString(),
        updated_at: supabaseUser?.updated_at || new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error getting user by ID', error.stack, 'UserService');
      throw new NotFoundException('User not found');
    }
  }
}
```

## 4. Logging Standards

### 4.1 Structured Logging
```typescript
// ✅ CORRECT: Structured logging with context
this.logger.debug('JWT validation successful', {
  userId: userContext.id,
  role: userContext.role,
  tier: userContext.tier
});

this.logger.error('JWT validation failed', error.stack, 'JwtStrategy', { 
  userId: payload.sub 
});
```

### 4.2 Log Levels
- **debug**: Development debugging information
- **info**: General application flow
- **warn**: Warning conditions
- **error**: Error conditions with stack traces

## 5. Configuration Standards

### 5.1 Environment-Based Configuration
```typescript
// ✅ CORRECT: Configuration with defaults
export default registerAs('supabase', () => ({
  url: process.env.SUPABASE_URL || 'https://your-project.supabase.co',
  anonKey: process.env.SUPABASE_ANON_KEY || 'your-anon-key-here',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key-here',
  
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  
  rateLimits: {
    free: { requests: 10, window: 3600 },
    pro: { requests: 100, window: 3600 },
    enterprise: { requests: 1000, window: 3600 },
  },
}));
```

## 6. Security Standards

### 6.1 Authentication & Authorization
```typescript
// ✅ CORRECT: Role-based access control
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('enterprise')
@Post()
async createUser(@Body() createUserDto: CreateUserDto) {
  // Implementation
}
```

### 6.2 Input Validation
```typescript
// ✅ CORRECT: DTO validation
export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsIn(['free', 'pro', 'enterprise'])
  role?: 'free' | 'pro' | 'enterprise';
}
```

## 7. Testing Standards

### 7.1 Unit Tests
```typescript
// ✅ CORRECT: Comprehensive unit test
describe('UserService', () => {
  let service: UserService;
  let supabaseService: jest.Mocked<SupabaseService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: SupabaseService,
          useValue: {
            getUserProfile: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    supabaseService = module.get(SupabaseService);
  });

  it('should get user by ID with fallback', async () => {
    // Test implementation
  });
});
```

## 8. API Response Standards

### 8.1 Consistent Response Format
```typescript
// ✅ CORRECT: Standardized API response
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  meta: {
    timestamp: string;
    version: string;
    requestId?: string;
    processingTime?: number;
  };
  errors: Array<{
    code: string;
    message: string;
    timestamp: string;
    path?: string;
    method?: string;
  }>;
}
```

## 9. Documentation Standards

### 9.1 Swagger/OpenAPI
```typescript
// ✅ CORRECT: Comprehensive API documentation
@ApiOperation({ 
  summary: 'Create new user',
  description: 'Creates a new user account with specified role and tier'
})
@ApiResponse({ 
  status: 201, 
  description: 'User created successfully',
  type: UserProfile
})
@ApiResponse({ 
  status: 400, 
  description: 'Invalid input data'
})
@ApiResponse({ 
  status: 409, 
  description: 'User already exists'
})
```

## 10. Performance Standards

### 10.1 Caching Strategy
- Redis for response caching
- TTL-based cache invalidation
- Tier-based cache limits

### 10.2 Database Optimization
- Connection pooling
- Query optimization
- Index usage

## 11. Deployment Standards

### 11.1 Docker Configuration
- Multi-stage builds
- Security scanning
- Health checks

### 11.2 Kubernetes Deployment
- Resource limits
- Readiness/liveness probes
- ConfigMaps and Secrets

---

**BMAD Method Compliance**: This document ensures all code follows Business Model Architecture Development methodology with clear separation of concerns, comprehensive testing, and production-ready standards.
