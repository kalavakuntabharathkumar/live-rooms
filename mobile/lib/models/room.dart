class Room {
  final String id;
  final String name;
  final String description;
  final String createdBy;
  final String createdByName;
  final bool isActive;
  final int memberCount;
  final List<String> members;
  final DateTime? createdAt;

  const Room({
    required this.id,
    required this.name,
    required this.description,
    required this.createdBy,
    required this.createdByName,
    required this.isActive,
    required this.memberCount,
    required this.members,
    this.createdAt,
  });

  factory Room.fromJson(Map<String, dynamic> json) {
    return Room(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String? ?? '',
      createdBy: json['createdBy'] as String,
      createdByName: json['createdByName'] as String? ?? 'Unknown',
      isActive: json['isActive'] as bool? ?? true,
      memberCount: json['memberCount'] as int? ?? 0,
      members: List<String>.from(json['members'] as List? ?? []),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'createdBy': createdBy,
        'createdByName': createdByName,
        'isActive': isActive,
        'memberCount': memberCount,
        'members': members,
      };
}
