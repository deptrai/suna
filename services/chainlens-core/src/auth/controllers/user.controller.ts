import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete,
  Body, 
  Param, 
  UseGuards,
  HttpStatus,
  HttpCode,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UserService, UserProfile } from '../services/user.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { UserContext } from '../constants/jwt.constants';
import { LoggerService } from '../../common/services/logger.service';

@ApiTags('User Management')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(
    private userService: UserService,
    private logger: LoggerService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('enterprise') // Only enterprise users can create other users
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Enterprise role required' })
  async createUser(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() currentUser: UserContext,
  ) {
    this.logger.debug('Creating user via API', { 
      email: createUserDto.email, 
      requestedBy: currentUser.id 
    });

    const user = await this.userService.createUser(createUserDto);

    return {
      success: true,
      data: {
        user,
        message: 'User created successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      errors: [],
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getCurrentUser(@CurrentUser() currentUser: UserContext) {
    this.logger.debug('Getting current user profile', { userId: currentUser.id });

    const user = await this.userService.getUserById(currentUser.id);

    return {
      success: true,
      data: {
        user,
        message: 'User profile retrieved successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      errors: [],
    };
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('pro', 'enterprise') // Pro and Enterprise users can view other users
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Pro role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(
    @Param('id') userId: string,
    @CurrentUser() currentUser: UserContext,
  ) {
    this.logger.debug('Getting user by ID via API', { 
      userId, 
      requestedBy: currentUser.id 
    });

    const user = await this.userService.getUserById(userId);

    return {
      success: true,
      data: {
        user,
        message: 'User retrieved successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      errors: [],
    };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('enterprise') // Only enterprise users can list users
  @ApiOperation({ summary: 'Search users by email' })
  @ApiQuery({ name: 'email', description: 'Email to search for', required: false })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Enterprise role required' })
  async searchUsers(
    @Query('email') email?: string,
    @CurrentUser() currentUser?: UserContext,
  ) {
    this.logger.debug('Searching users via API', { 
      email, 
      requestedBy: currentUser?.id 
    });

    if (!email) {
      return {
        success: true,
        data: {
          users: [],
          message: 'Please provide email parameter to search',
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
        errors: [],
      };
    }

    const user = await this.userService.getUserByEmail(email);

    return {
      success: true,
      data: {
        users: user ? [user] : [],
        message: user ? 'User found' : 'No user found with this email',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      errors: [],
    };
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('enterprise') // Only enterprise users can update other users
  @ApiOperation({ summary: 'Update user profile' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Enterprise role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: UserContext,
  ) {
    this.logger.debug('Updating user via API', { 
      userId, 
      updates: Object.keys(updateUserDto),
      requestedBy: currentUser.id 
    });

    const user = await this.userService.updateUser(userId, updateUserDto);

    return {
      success: true,
      data: {
        user,
        message: 'User updated successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      errors: [],
    };
  }

  @Put('me/profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateCurrentUser(
    @Body() updateUserDto: Omit<UpdateUserDto, 'role' | 'tier'>, // Users can't change their own role/tier
    @CurrentUser() currentUser: UserContext,
  ) {
    this.logger.debug('Updating current user profile', { 
      userId: currentUser.id,
      updates: Object.keys(updateUserDto)
    });

    const user = await this.userService.updateUser(currentUser.id, updateUserDto);

    return {
      success: true,
      data: {
        user,
        message: 'Profile updated successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      errors: [],
    };
  }

  @Put(':id/upgrade')
  @UseGuards(RolesGuard)
  @Roles('enterprise') // Only enterprise users can upgrade other users
  @ApiOperation({ summary: 'Upgrade user tier' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User tier upgraded successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Enterprise role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async upgradeUserTier(
    @Param('id') userId: string,
    @Body() body: { tier: 'pro' | 'enterprise' },
    @CurrentUser() currentUser: UserContext,
  ) {
    this.logger.debug('Upgrading user tier via API', { 
      userId, 
      newTier: body.tier,
      requestedBy: currentUser.id 
    });

    const user = await this.userService.upgradeUserTier(userId, body.tier);

    return {
      success: true,
      data: {
        user,
        message: `User tier upgraded to ${body.tier} successfully`,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      errors: [],
    };
  }

  @Put(':id/downgrade')
  @UseGuards(RolesGuard)
  @Roles('enterprise') // Only enterprise users can downgrade other users
  @ApiOperation({ summary: 'Downgrade user tier to free' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User tier downgraded successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Enterprise role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async downgradeUserTier(
    @Param('id') userId: string,
    @CurrentUser() currentUser: UserContext,
  ) {
    this.logger.debug('Downgrading user tier via API', { 
      userId,
      requestedBy: currentUser.id 
    });

    const user = await this.userService.downgradeUserTier(userId);

    return {
      success: true,
      data: {
        user,
        message: 'User tier downgraded to free successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      errors: [],
    };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('enterprise') // Only enterprise users can deactivate other users
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate user (soft delete)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 204, description: 'User deactivated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Enterprise role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deactivateUser(
    @Param('id') userId: string,
    @CurrentUser() currentUser: UserContext,
  ) {
    this.logger.debug('Deactivating user via API', { 
      userId,
      requestedBy: currentUser.id 
    });

    await this.userService.deactivateUser(userId);

    this.logger.log('User deactivated via API', { userId, deactivatedBy: currentUser.id });
  }
}
