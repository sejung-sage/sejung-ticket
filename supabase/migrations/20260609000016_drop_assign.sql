-- 강좌–강의실 배정 기능 제거 (시간표 업로드로 대체). 미사용 객체 정리.
drop function if exists analytics.dash_courses(text, int);
drop table if exists analytics.class_room_assignment;
