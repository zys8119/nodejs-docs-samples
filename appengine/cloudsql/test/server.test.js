/**
 * Copyright 2017, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const express = require(`express`);
const path = require(`path`);
const proxyquire = require(`proxyquire`).noCallThru();
const request = require(`supertest`);
const sinon = require(`sinon`);
const test = require(`ava`);
const tools = require(`@google-cloud/nodejs-repo-tools`);

const SAMPLE_PATH = path.join(__dirname, `../server.js`);

function getSample (sqlClient) {
  const testApp = express();
  sinon.stub(testApp, `listen`).yields();
  const expressMock = sinon.stub().returns(testApp);
  const resultsMock = [
    {
      timestamp: `1234`,
      userIp: `abcd`
    }
  ];

  const knexMock = sinon.stub().returns({
    insert: sinon.stub().returns(Promise.resolve())
  });
  Object.assign(knexMock, {
    select: sinon.stub().returnsThis(),
    from: sinon.stub().returnsThis(),
    orderBy: sinon.stub().returnsThis(),
    limit: sinon.stub().returns(Promise.resolve(resultsMock))
  });

  const KnexMock = sinon.stub().returns(knexMock);

  const processMock = {
    env: {
      SQL_CLIENT: sqlClient,
      MYSQL_USER: 'mysql_user',
      MYSQL_PASSWORD: 'mysql_password',
      MYSQL_DATABASE: 'mysql_database',
      POSTGRES_USER: 'postgres_user',
      POSTGRES_PASSWORD: 'postgres_password',
      POSTGRES_DATABASE: 'postgres_database'
    }
  };

  const app = proxyquire(SAMPLE_PATH, {
    knex: KnexMock,
    express: expressMock,
    process: processMock
  });

  return {
    app: app,
    mocks: {
      express: expressMock,
      results: resultsMock,
      knex: knexMock,
      Knex: KnexMock,
      process: processMock
    }
  };
}

test.beforeEach(tools.stubConsole);
test.afterEach.always(tools.restoreConsole);

test(`should set up sample in MySQL`, (t) => {
  const sample = getSample('mysql');

  t.true(sample.mocks.express.calledOnce);
  t.true(sample.mocks.Knex.calledOnce);
  t.deepEqual(sample.mocks.Knex.firstCall.args, [{
    client: 'mysql',
    connection: {
      user: sample.mocks.process.env.MYSQL_USER,
      password: sample.mocks.process.env.MYSQL_PASSWORD,
      database: sample.mocks.process.env.MYSQL_DATABASE
    }
  }]);
});

test(`should set up sample in Postgres`, (t) => {
  const sample = getSample('pg');

  t.true(sample.mocks.express.calledOnce);
  t.true(sample.mocks.Knex.calledOnce);
  t.deepEqual(sample.mocks.Knex.firstCall.args, [{
    client: 'pg',
    connection: {
      user: sample.mocks.process.env.POSTGRES_USER,
      password: sample.mocks.process.env.POSTGRES_PASSWORD,
      database: sample.mocks.process.env.POSTGRES_DATABASE
    }
  }]);
});

test(`should validate SQL_CLIENT env var`, (t) => {
  const expected = `The SQL_CLIENT environment variable must be set to 'pg' or 'mysql'.`;
  t.throws(() => { getSample(null); }, expected);
  t.throws(() => { getSample('foo'); }, expected);

  t.notThrows(() => { getSample('mysql'); });
  t.notThrows(() => { getSample('pg'); });
});

test.cb(`should record a visit in mysql`, (t) => {
  const sample = getSample('mysql');
  const expectedResult = `Last 10 visits:\nTime: 1234, AddrHash: abcd`;

  request(sample.app)
    .get(`/`)
    .expect(200)
    .expect((response) => {
      t.is(response.text, expectedResult);
    })
    .end(t.end);
});

test.cb(`should handle insert error`, (t) => {
  const sample = getSample('mysql');
  const expectedResult = `insert_error`;

  sample.mocks.knex.limit.returns(Promise.reject(expectedResult));

  request(sample.app)
    .get(`/`)
    .expect(500)
    .expect((response) => {
      t.is(response.text.includes(expectedResult), true);
    })
    .end(t.end);
});

test.cb(`should handle read error`, (t) => {
  const sample = getSample('mysql');
  const expectedResult = `read_error`;

  sample.mocks.knex.limit.returns(Promise.reject(expectedResult));

  request(sample.app)
    .get(`/`)
    .expect(500)
    .expect((response) => {
      t.is(response.text.includes(expectedResult), true);
    })
    .end(t.end);
});
