-- P5.5-5A: round_kind 확장 (2→11) + author_mode 신설
-- 기존 행 변경 없음. 기존 Migration 수정 없음.

-- 1) round_kind enum 확장 — 기존 '소장','준비서면' 유지, 9개 추가
alter type round_kind add value '내용증명';
alter type round_kind add value '가압류신청서';
alter type round_kind add value '가처분신청서';
alter type round_kind add value '강제집행신청서';
alter type round_kind add value '등기신청서_소유권이전';
alter type round_kind add value '등기신청서_근저당설정';
alter type round_kind add value '등기신청서_법인변경';
alter type round_kind add value '개인회생신청서';
alter type round_kind add value '파산면책신청서';

-- 2) author_mode enum 신설
create type author_mode as enum ('lawyer', 'judicial_scrivener');

-- 3) cases.author_mode 컬럼 추가 (기존 행은 'lawyer' 기본값)
alter table cases add column author_mode author_mode not null default 'lawyer';
