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

    it('should return fallback user when Supabase fails', async () => {
      // Arrange
      const userId = 'test-user-id';
      supabaseService.getUserProfile.mockRejectedValue(new Error('Supabase error'));

      // Act
      const result = await service.getUserById(userId);

      // Assert
      expect(result).toEqual({
        id: userId,
        email: 'unknown@chainlens.com',
        role: 'free',
        tier: 'free',
        isActive: true,
        metadata: {},
        created_at: expect.any(String),
        updated_at: expect.any(String),
      });
      expect(loggerService.debug).toHaveBeenCalledWith(
        'Profile not found, using defaults',
        expect.objectContaining({ userId })
      );
    });

    it('should throw NotFoundException for invalid user ID', async () => {
      // Arrange
      const userId = '';

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

    it('should create user successfully', async () => {
      // Arrange
      const createdUser = { ...mockUser, email: createUserDto.email };
      supabaseService.createUser.mockResolvedValue({
        user: createdUser,
        error: null,
      });

      // Act
      const result = await service.createUser(createUserDto);

      // Assert
      expect(result).toEqual(createdUser);
      expect(supabaseService.createUser).toHaveBeenCalledWith(
        createUserDto.email,
        createUserDto.password,
        expect.objectContaining({
          role: createUserDto.role,
          firstName: createUserDto.firstName,
          lastName: createUserDto.lastName,
        })
      );
    });

    it('should throw ConflictException when user already exists', async () => {
      // Arrange
      supabaseService.createUser.mockResolvedValue({
        user: null,
        error: { message: 'User already registered' },
      });

      // Act & Assert
      await expect(service.createUser(createUserDto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for invalid email', async () => {
      // Arrange
      const invalidDto = { ...createUserDto, email: 'invalid-email' };

      // Act & Assert
      await expect(service.createUser(invalidDto)).rejects.toThrow(BadRequestException);
    });
  });

  // Additional tests can be added here for other UserService methods
  // when they are implemented in the actual service
});
