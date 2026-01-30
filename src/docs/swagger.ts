import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Jarvis API',
      version: '1.0.0',
      description: 'Documentación OpenAPI para Jarvis API',
    },
    servers: [
      {
        url: '/api/v1',
        description: 'API base path (versioned)'
      }
    ]
  },
  // Scan these folders for JSDoc/OpenAPI annotations
  apis: ['src/**/*.ts', 'src/**/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
