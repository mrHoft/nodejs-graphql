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
import { createLoaders, preloadData } from './loaders.js';
import { MemberType, MemberTypeIdEnumType, PostType, ProfileType, UserType } from './types/schema.js';

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

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
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        memberTypes: {
          type: new GraphQLList(MemberType),
          resolve: (_, __, { loaders }) => loaders.memberTypes.load('ALL')
        },
        memberType: {
          type: MemberType,
          args: { id: { type: new GraphQLNonNull(MemberTypeIdEnumType) } },
          resolve: (_, { id }, { loaders }) => loaders.memberTypes.load(id)
        },
        users: {
          type: new GraphQLList(UserType),
          resolve: async (_, __, { loaders }) => {
            try {
              const users = await loaders.users.load('ALL');

              console.log('Resolver received:', users?.length ?? 0, 'users');

              if (!Array.isArray(users)) {
                console.error('Expected array, got:', typeof users);
                return [];
              }

              return users;
            } catch (err) {
              console.error('Error in users resolver:', (err instanceof Error) ? err.message : err);
              return [];
            }
          }
        },
        user: {
          type: UserType,
          args: { id: { type: new GraphQLNonNull(UUIDType) } },
          resolve: (_, { id }, { loaders }, info) => loaders.users.load({ id, info })
        },
        posts: {
          type: new GraphQLList(PostType),
          resolve: (_, __, { loaders }) => loaders.posts.load('ALL')
        },
        post: {
          type: PostType,
          args: { id: { type: new GraphQLNonNull(UUIDType) } },
          resolve: (_, { id }, { loaders }) => loaders.posts.load(id)
        },
        profiles: {
          type: new GraphQLList(ProfileType),
          resolve: (_, __, { loaders }) => loaders.profiles.load('ALL')
        },
        profile: {
          type: ProfileType,
          args: { id: { type: new GraphQLNonNull(UUIDType) } },
          resolve: (_, { id }, { loaders }) => loaders.profiles.load(id)
        }
      }
    }),
    mutation: Mutations
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
      const depthLimitRule = depthLimit(5);
      const loaders = createLoaders(prisma);

      try {
        const document = parse(req.body.query);
        const validationErrors = validate(schema, document, [depthLimitRule]);

        if (validationErrors.length > 0) {
          return { errors: validationErrors };
        }
        /* 
        const shouldPreload = document.definitions.some(def =>
          def.kind === 'OperationDefinition' &&
          def.selectionSet.selections.some(sel =>
            sel.kind === 'Field' &&
            ['users', 'posts', 'profiles', 'memberTypes'].includes(sel.name.value)
          )
        );

        if (shouldPreload) {
          await loaders.preloadAllData();
        } */
        await preloadData(loaders);

        return await execute({
          schema,
          document,
          variableValues: req.body.variables,
          contextValue: { prisma, loaders },
        });
      } catch (error) {
        return { errors: [error] };
      }
    },
  });
};

export default plugin;
