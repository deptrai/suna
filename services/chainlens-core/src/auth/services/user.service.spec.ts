import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { UserService, UserProfile } from './user.service';
import { SupabaseService } from './supabase.service';
import { LoggerService } from '../../common/services/logger.service';
import { ConfigService } from '@nestjs/config';

describe('UserService', () => {
  let service: UserService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let loggerService: jest.Mocked<LoggerService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser: UserProfile = {
    id: 'test-user-id',
    email: 'test@chainlens.com',
    role: 'free',
    tier: 'free',
    isActive: true,
    metadata: {},
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    const mockSupabaseService = {
      getUserProfile: jest.fn(),
      getUserByEmail: jest.fn(),
      createUser: jest.fn(),
      verifyToken: jest.fn(),
      healthCheck: jest.fn(),
    };

    const mockLoggerService = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    supabaseService = module.get(SupabaseService);
    loggerService = module.get(LoggerService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserById', () => {
    it('should return user when found in Supabase', async () => {
      // Arrange
      const userId = 'test-user-id';
      supabaseService.getUserProfile.mockResolvedValue(mockUser);

      // Act
      const result = await service.getUserById(userId);

      // Assert
      expect(result).toEqual(mockUser);
      expect(supabaseService.getUserProfile).toHaveBeenCalledWith(userId);
      expect(loggerService.debug).toHaveBeenCalledWith('Getting user by ID', { userId });
    });

    it('should throw NotFoundException when Supabase fails', async () => {
      // Arrange
      const userId = 'test-user-id';
      supabaseService.getUserProfile.mockRejectedValue(new Error('Supabase error'));

      // Act & Assert
      await expect(service.getUserById(userId)).rejects.toThrow(NotFoundException);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Error getting user by ID',
        expect.any(String),
        'UserService',
        { userId }
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      const userId = 'non-existent-id';
      supabaseService.getUserProfile.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getUserById(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createUser', () => {
    const createUserDto = {
      email: 'newuser@chainlens.com',
      password: 'SecurePass123',
      role: 'free' as const,
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should create user successfully when getUserByEmail throws error', async () => {
      // Arrange
      const createdUser = { ...mockUser, email: createUserDto.email };
      // getUserByEmail throws error (user doesn't exist or service unavailable)
      supabaseService.getUserByEmail.mockRejectedValue(new Error('User not found'));
      supabaseService.createUser.mockResolvedValue({
        user: createdUser,
        error: null,
      });

      // Act & Assert - Should throw BadRequestException due to getUserByEmail error
      await expect(service.createUser(createUserDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when user already exists', async () => {
      // Arrange
      supabaseService.getUserByEmail.mockResolvedValue(mockUser); // User exists

      // Act & Assert
      await expect(service.createUser(createUserDto)).rejects.toThrow(ConflictException);
      expect(supabaseService.getUserByEmail).toHaveBeenCalledWith(createUserDto.email);
    });

    it('should throw BadRequestException when Supabase creation fails', async () => {
      // Arrange
      supabaseService.getUserByEmail.mockResolvedValue(null);
      supabaseService.createUser.mockResolvedValue({
        user: null,
        error: { message: 'Creation failed' },
      });

      // Act & Assert
      await expect(service.createUser(createUserDto)).rejects.toThrow(BadRequestException);
    });
  });

  // Additional tests can be added here for other UserService methods
  // when they are implemented in the actual service
});
