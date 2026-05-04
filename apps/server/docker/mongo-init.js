db = db.getSiblingDB('filler');

db.createUser({
  user: 'filler_admin',
  pwd: 'zagalnasprava',
  roles: [
    {
      role: 'readWrite',
      db: 'filler'
    }
  ]
});
