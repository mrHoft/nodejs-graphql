import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import depthLimit from 'graphql-depth-limit'
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import {
  execute, parse, validate,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLInt,
  GraphQLInputObjectType
} from 'graphql';
import { UUIDType } from './types/uuid.js';
import { MemberType, MemberTypeIdEnumType } from './types/member.js';
import { PostType } from './types/post.js';
import { ProfileType } from './types/profile.js';
import { UserType } from './types/user.js';

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  const RootQueryType = new GraphQLObjectType({
    name: 'RootQueryType',
    fields: {
      memberTypes: {
        type: new GraphQLList(MemberType),
        resolve: () => prisma.memberType.findMany(),
      },
      memberType: {
        type: MemberType,
        args: {
          id: { type: new GraphQLNonNull(MemberTypeIdEnumType) },
        },
        resolve: (_, { id }: { id: string }) => prisma.memberType.findUnique({ where: { id } }),
      },
      users: {
        type: new GraphQLList(UserType),
        resolve: () => prisma.user.findMany(),
      },
      user: {
        type: UserType,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: (_, { id }: { id: string }) => prisma.user.findUnique({ where: { id } }),
      },
      posts: {
        type: new GraphQLList(PostType),
        resolve: () => prisma.post.findMany(),
      },
      post: {
        type: PostType,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: (_, { id }: { id: string }) => prisma.post.findUnique({ where: { id } }),
      },
      profiles: {
        type: new GraphQLList(ProfileType),
        resolve: () => prisma.profile.findMany(),
      },
      profile: {
        type: ProfileType,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: (_, { id }: { id: string }) => prisma.profile.findUnique({ where: { id } }),
      },
      subscriptions: {
        type: new GraphQLList(new GraphQLObjectType({
          name: 'Subscription',
          fields: {
            subscriber: { type: UserType },
            author: { type: UserType },
            createdAt: { type: GraphQLString },
          },
        })),
        resolve: () => prisma.subscribersOnAuthors.findMany({
          include: {
            subscriber: true,
            author: true,
          },
        }),
      },
    },
  });

  const Mutations = new GraphQLObjectType({
    name: 'Mutations',
    fields: {
      createUser: {
        type: UserType,
        args: {
          dto: {
            type: new GraphQLNonNull(new GraphQLInputObjectType({
              name: 'CreateUserInput',
              fields: {
                name: { type: new GraphQLNonNull(GraphQLString) },
                balance: { type: new GraphQLNonNull(GraphQLFloat) },
              },
            })),
          },
        },
        resolve: (_, { dto }: { dto: { name: string; balance: number } }) =>
          prisma.user.create({ data: dto }),
      },
      createProfile: {
        type: ProfileType,
        args: {
          dto: {
            type: new GraphQLNonNull(new GraphQLInputObjectType({
              name: 'CreateProfileInput',
              fields: {
                isMale: { type: new GraphQLNonNull(GraphQLBoolean) },
                yearOfBirth: { type: new GraphQLNonNull(GraphQLInt) },
                userId: { type: new GraphQLNonNull(UUIDType) },
                memberTypeId: { type: new GraphQLNonNull(MemberTypeIdEnumType) },
              },
            })),
          },
        },
        resolve: (_, { dto }: {
          dto: {
            isMale: boolean;
            yearOfBirth: number;
            userId: string;
            memberTypeId: string
          }
        }) => prisma.profile.create({
          data: dto,
          include: { memberType: true },
        }),
      },
      createPost: {
        type: PostType,
        args: {
          dto: {
            type: new GraphQLNonNull(new GraphQLInputObjectType({
              name: 'CreatePostInput',
              fields: {
                title: { type: new GraphQLNonNull(GraphQLString) },
                content: { type: new GraphQLNonNull(GraphQLString) },
                authorId: { type: new GraphQLNonNull(UUIDType) },
              },
            })),
          },
        },
        resolve: (_, { dto }: {
          dto: {
            title: string;
            content: string;
            authorId: string
          }
        }) => prisma.post.create({ data: dto }),
      },
      changePost: {
        type: PostType,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
          dto: {
            type: new GraphQLNonNull(new GraphQLInputObjectType({
              name: 'ChangePostInput',
              fields: {
                title: { type: GraphQLString },
                content: { type: GraphQLString },
              },
            })),
          },
        },
        resolve: (_, { id, dto }: {
          id: string;
          dto: { title?: string; content?: string }
        }) => prisma.post.update({ where: { id }, data: dto }),
      },
      changeProfile: {
        type: ProfileType,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
          dto: {
            type: new GraphQLNonNull(new GraphQLInputObjectType({
              name: 'ChangeProfileInput',
              fields: {
                isMale: { type: GraphQLBoolean },
                yearOfBirth: { type: GraphQLInt },
                memberTypeId: { type: MemberTypeIdEnumType },
              },
            })),
          },
        },
        resolve: (_, { id, dto }: {
          id: string;
          dto: { isMale?: boolean; yearOfBirth?: number; memberTypeId?: string }
        }) => prisma.profile.update({
          where: { id },
          data: dto,
          include: { memberType: true },
        }),
      },
      changeUser: {
        type: UserType,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
          dto: {
            type: new GraphQLNonNull(new GraphQLInputObjectType({
              name: 'ChangeUserInput',
              fields: {
                name: { type: GraphQLString },
                balance: { type: GraphQLFloat },
              },
            })),
          },
        },
        resolve: (_, { id, dto }: {
          id: string;
          dto: { name?: string; balance?: number }
        }) => prisma.user.update({ where: { id }, data: dto }),
      },
      deleteUser: {
        type: GraphQLString,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: async (_, { id }: { id: string }) => {
          await prisma.user.delete({ where: { id } });
          return 'User deleted successfully';
        },
      },
      deletePost: {
        type: GraphQLString,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: async (_, { id }: { id: string }) => {
          await prisma.post.delete({ where: { id } });
          return 'Post deleted successfully';
        },
      },
      deleteProfile: {
        type: GraphQLString,
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: async (_, { id }: { id: string }) => {
          await prisma.profile.delete({ where: { id } });
          return 'Profile deleted successfully';
        },
      },
      subscribeTo: {
        type: GraphQLString,
        args: {
          userId: { type: new GraphQLNonNull(UUIDType) },
          authorId: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: async (_, { userId, authorId }) => {
          // Check if subscription already exists
          const existing = await prisma.subscribersOnAuthors.findUnique({
            where: {
              subscriberId_authorId: {
                subscriberId: userId,
                authorId: authorId,
              },
            },
          });

          if (existing) {
            throw new Error('User is already subscribed to this author');
          }

          await prisma.subscribersOnAuthors.create({
            data: {
              subscriberId: userId,
              authorId: authorId,
            },
          });
          return 'Subscribed successfully';
        },
      },
      unsubscribeFrom: {
        type: GraphQLString,
        args: {
          userId: { type: new GraphQLNonNull(UUIDType) },
          authorId: { type: new GraphQLNonNull(UUIDType) },
        },
        resolve: async (_, { userId, authorId }) => {
          await prisma.subscribersOnAuthors.delete({
            where: {
              subscriberId_authorId: {
                subscriberId: userId,
                authorId: authorId,
              },
            },
          });
          return 'Unsubscribed successfully';
        },
      },
    },
  });

  const schema = new GraphQLSchema({
    query: RootQueryType,
    mutation: Mutations,
  });

  fastify.route({
    url: '/',
    method: 'POST',
    schema: {
      ...createGqlResponseSchema,
      response: {
        200: gqlResponseSchema,
      },
    },
    async handler(req) {
      const depthLimitRule = depthLimit(5)

      try {
        const document = parse(req.body.query);
        const validationErrors = validate(schema, document, [depthLimitRule]);

        if (validationErrors.length > 0) {
          return { errors: validationErrors };
        }

        return await execute({
          schema,
          document,
          variableValues: req.body.variables,
          contextValue: { prisma },
        });
      } catch (error) {
        return { errors: [error] };
      }
    },
  });
};

export default plugin;
