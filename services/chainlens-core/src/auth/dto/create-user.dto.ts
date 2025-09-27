import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsIn, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @ApiProperty({
    example: 'user@chainlens.com',
    description: 'User email address',
    format: 'email'
  })
  email: string;

  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
  })
  @ApiProperty({
    example: 'SecurePass123',
    description: 'User password (min 8 chars, must contain uppercase, lowercase, and number)',
    minLength: 8
  })
  password: string;

  @IsOptional()
  @IsIn(['free', 'pro', 'enterprise'], {
    message: 'Role must be one of: free, pro, enterprise'
  })
  @ApiProperty({
    example: 'free',
    description: 'User subscription tier',
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  })
  role?: 'free' | 'pro' | 'enterprise';

  @IsOptional()
  @IsString({ message: 'First name must be a string' })
  @ApiProperty({
    example: 'John',
    description: 'User first name',
    required: false
  })
  firstName?: string;

  @IsOptional()
  @IsString({ message: 'Last name must be a string' })
  @ApiProperty({
    example: 'Doe',
    description: 'User last name',
    required: false
  })
  lastName?: string;
}
