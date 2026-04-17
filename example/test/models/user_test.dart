import 'package:flutter_test/flutter_test.dart';
import 'package:flutterboard_example/models/user.dart';

void main() {
  group('User', () {
    final now = DateTime(2024, 1, 15, 10, 30);

    test('fromJson creates User with required fields', () {
      final json = {
        'id': 'u1',
        'name': 'Alice',
        'email': 'alice@example.com',
        'createdAt': now.toIso8601String(),
      };
      final user = User.fromJson(json);
      expect(user.id, 'u1');
      expect(user.name, 'Alice');
      expect(user.email, 'alice@example.com');
      expect(user.createdAt, now);
      expect(user.displayName, isNull);
      expect(user.uid, isNull);
    });

    test('fromJson with optional fields', () {
      final json = {
        'id': 'u2',
        'name': 'Bob',
        'email': 'bob@example.com',
        'displayName': 'Bobby',
        'uid': 'firebase-uid-123',
        'createdAt': now.toIso8601String(),
      };
      final user = User.fromJson(json);
      expect(user.displayName, 'Bobby');
      expect(user.uid, 'firebase-uid-123');
    });

    test('toJson produces valid map', () {
      final user = User(
        id: 'u3',
        name: 'Charlie',
        email: 'charlie@example.com',
        createdAt: now,
      );
      final json = user.toJson();
      expect(json['id'], 'u3');
      expect(json['name'], 'Charlie');
      expect(json['email'], 'charlie@example.com');
      expect(json['createdAt'], now.toIso8601String());
      expect(json['displayName'], isNull);
    });

    test('roundtrip fromJson -> toJson preserves data', () {
      final original = User(
        id: 'u4',
        name: 'Diana',
        email: 'diana@example.com',
        displayName: 'Di',
        uid: 'uid-456',
        createdAt: now,
      );
      final restored = User.fromJson(original.toJson());
      expect(restored.id, original.id);
      expect(restored.name, original.name);
      expect(restored.email, original.email);
      expect(restored.displayName, original.displayName);
      expect(restored.uid, original.uid);
      expect(restored.createdAt, original.createdAt);
    });
  });
}
