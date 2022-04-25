'use strict';

const { faker } = require('@faker-js/faker');

const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  logging: true,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

const queryInterface = sequelize.getQueryInterface();

let usersBuilt = 1;

const buildUser = () => {
  return {
      id:                     faker.datatype.uuid(),
      firstname:              faker.name.findName(),
      lastname:               faker.name.lastName(),
      username:               'a' + faker.word.noun() + faker.datatype.number(),
      email:                  faker.internet.email(),
      password:               faker.word.noun(6),
      channelDescription:     faker.lorem.words(5),
      createdAt:              new Date(),
      updatedAt:              new Date()
  };
};

const genThisTime = 1000; // 10, or 100, or 1000

queryInterface.bulkInsert('Users', [...new Array(genThisTime)].map(buildUser));
