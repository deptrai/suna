import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    example: 'user-uuid-123',
    description: 'Unique user identifier'
  })
  id: string;

  @ApiProperty({
    example: 'user@chainlens.com',
    description: 'User email address'
  })
  email: string;

  @ApiProperty({
    example: 'John',
    description: 'User first name'
  })
  firstName?: string;

  @ApiProperty({
    example: 'Doe',
    description: 'User last name'
  })
  lastName?: string;

  @ApiProperty({
    example: 'free',
    description: 'User subscription tier',
    enum: ['free', 'pro', 'enterprise']
  })
  role: 'free' | 'pro' | 'enterprise';

  @ApiProperty({
    example: true,
    description: 'User active status'
  })
  isActive: boolean;

  @ApiProperty({
    example: {
      preferences: {
        theme: 'dark',
        language: 'en'
      }
    },
    description: 'User metadata and preferences'
  })
  metadata?: any;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'User creation timestamp'
  })
  created_at: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'User last update timestamp'
  })
  updated_at: string;
}

export class AuthResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT access token'
  })
  access_token: string;

  @ApiProperty({
    example: 'Bearer',
    description: 'Token type'
  })
  token_type: string;

  @ApiProperty({
    example: 86400,
    description: 'Token expiration time in seconds'
  })
  expires_in: number;

  @ApiProperty({
    type: UserResponseDto,
    description: 'User information'
  })
  user: UserResponseDto;
}
